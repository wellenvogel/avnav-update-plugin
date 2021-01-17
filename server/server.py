# -*- coding: utf-8 -*-
# vim: ts=2 sw=2 et ai
###############################################################################
# Copyright (c) 2021 Andreas Vogel andreas@wellenvogel.net
#
#  Permission is hereby granted, free of charge, to any person obtaining a
#  copy of this software and associated documentation files (the "Software"),
#  to deal in the Software without restriction, including without limitation
#  the rights to use, copy, modify, merge, publish, distribute, sublicense,
#  and/or sell copies of the Software, and to permit persons to whom the
#  Software is furnished to do so, subject to the following conditions:
#
#  The above copyright notice and this permission notice shall be included
#  in all copies or substantial portions of the Software.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
#  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
#  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
#  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
#  DEALINGS IN THE SOFTWARE.
#
###############################################################################
import getopt
import http.server
import logging.handlers
import os
import socketserver
import sys
import threading
import time

from handler import Handler
from websocket import HTTPWebSocketsHandler

class SimpleQueue:
  def __init__(self,size):
    self.condition=threading.Condition()
    self.data=[]
    self.size=size
    self.sequence=0

  def clear(self):
    self.condition.acquire()
    self.data=[]
    self.condition.notifyAll()
    self.condition.release()
  def add(self,item):
    self.condition.acquire()
    try:
      self.sequence+=1
      self.data.append((self.sequence,item))
      self.condition.notifyAll()
      if len(self.data) > self.size:
        self.data.pop(0)
    finally:
      self.condition.release()

  def read(self,lastSeq,timeout=1):
    rt=None
    loopCount=timeout*10
    while loopCount > 0:
      try:
        self.condition.acquire()
        for idx in range(len(self.data)-1,-1,-1):
          le=self.data[idx]
          if le[0] <= lastSeq:
            break
          rt=le
        if rt is not None:
          return rt
        self.condition.wait(0.1)
        loopCount=loopCount-1
      finally:
        self.condition.release()
    return None,None





class WSSimpleEcho(HTTPWebSocketsHandler,Handler):

  def on_ws_message(self, message):
    if message is None:
      message = ''
    # echo message back to client
    self.send_message(str(message))
    self.log_message('websocket received "%s"', str(message))

  def do_GET(self):
    if not self.path.startswith('/api/ws'):
      Handler.do_GET(self)
    HTTPWebSocketsHandler.do_GET(self)

  def on_ws_connected(self):
    self.server.addClient(self)
    self.log_message('%s', 'websocket connected')
    self.thread=threading.Thread(target=self.fetch)
    self.thread.setDaemon(True)
    self.stop=False
    self.thread.start()

  def fetch(self):
    sequence = 0
    while not self.stop:
      nsequence,message=self.server.queue.read(sequence,0.5)
      if nsequence is not None:
        self.send_message(message)
        sequence=nsequence

  def on_ws_closed(self):
    self.server.removeClient(self)
    self.stop=True
    self.log_message('%s', 'websocket closed')


class OurHTTPServer(socketserver.ThreadingMixIn,http.server.HTTPServer,Handler):
  def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
    http.server.HTTPServer.__init__(self,server_address,RequestHandlerClass,bind_and_activate)
    self.wsClients={}
    self.queue=SimpleQueue(100)

  def addClient(self,client):
    self.wsClients[client]=client

  def removeClient(self,client):
    try:
      del self.wsClients[client]
    except:
      pass

  def startAction(self,action):
    self.queue.clear()
    t=threading.Thread(target=self.actionRun,args=[action])
    t.setDaemon(True)
    t.start()

  def actionRun(self,command):
    count=30
    while count > 0:
      self.queue.add("action %s %d"%(command,count))
      time.sleep(1)
      count=count-1
    self.queue.add("action %s done" % (command))


def usage():
  print("usage: %s -p port [-l logdir]" % (sys.argv[0]))

if __name__ == '__main__':
  try:
    optlist,args=getopt.getopt(sys.argv[1:],'p:l:d')
  except getopt.GetoptError as err:
    print(err)
    usage()
    sys.exit(1)
  logdir="/var/lib/avnavupdate"
  port=None
  loglevel=logging.INFO
  for o,a in optlist:
    if o == '-p':
      port=int(a)
    elif o == '-l':
      logdir=a
    elif o == '-d':
      loglevel=logging.DEBUG

  if port is None:
    print("missing parameter port")
    sys.exit(1)

  if not os.path.exists(logdir):
    os.makedirs(logdir)
  if not os.path.exists(logdir) or not os.path.isdir(logdir):
    print("unable to create logdir %s"%logdir)
    sys.exit(1)
  if not os.access(logdir,os.W_OK):
    print("unable to write logdir %s"%logdir)
    sys.exit(1)
  logfile=os.path.join(logdir,"avnavupdate.log")
  print("starting at port %d, logging to %s"%(port,logfile))
  handler = logging.handlers.RotatingFileHandler(filename=logfile, encoding='utf-8', maxBytes=100000, backupCount=10)
  handler.doRollover()
  logging.basicConfig(handlers=[handler], level=loglevel, format='%(asctime)s-%(process)d: %(message)s')
  logging.info("AvNav updater started at port %d"%port)

  server=OurHTTPServer(('0.0.0.0',port),WSSimpleEcho)
  server.serve_forever()
