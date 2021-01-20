#! /usr/bin/env python3
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
import traceback

from commands import Commands
from handler import Handler
from network import NetworkChecker
from systemd import Systemd
from websocket import HTTPWebSocketsHandler
from packagelist import PackageList




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
      return
    HTTPWebSocketsHandler.do_GET(self)

  def on_ws_connected(self):
    self.server.addClient(self)
    self.log_message('%s', 'websocket connected')

  def on_ws_closed(self):
    self.server.removeClient(self)
    self.log_message('%s', 'websocket closed')

AVNAV_UNIT="avnav.service"

class AvNavState:
  RUNNING=1
  STOPPED=2
  UNCONFIGURED=3

class OurHTTPServer(socketserver.ThreadingMixIn,http.server.HTTPServer):
  def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
    http.server.HTTPServer.__init__(self,server_address,RequestHandlerClass,bind_and_activate)
    self.wsClients={}
    self.actionRunning=False
    self.currentAction=None
    self.lock=threading.Lock()
    self.packageList=PackageList('avnav')
    self.systemd=Systemd()
    self.lastAvNavState=None
    self.avNavState=AvNavState.UNCONFIGURED
    self.commandHandler=Commands(self._logCommand)
    self.networkChecker=NetworkChecker('www.google.de',checkInterval=20)
    self.networkChecker.available()

  def handle_error(self, request, client_address):
    estr=traceback.format_exc()
    logging.error("error in http request from %s: %s",str(client_address),estr)

  def addClient(self,client):
    self.wsClients[client]=client

  def removeClient(self,client):
    try:
      del self.wsClients[client]
    except:
      pass

  def _logCommand(self,msg):
    logging.info("[COMMAND]:%s"%msg)
    self.sendToClients(msg)

  def sendToClients(self,message):
    for c in list(self.wsClients.values()):
      try:
        c.send_message(message)
      except Exception as e:
        logging.debug("error sending to wsclient: %s",str(e))
  def startAction(self,action,parameters=None):
    if action in self.commandHandler.KNOWN_ACTIONS:
      self.lock.acquire()
      try:
        if self.commandHandler.hasRunningCommand():
          return False
        self.commandHandler.runAction(action, parameters)
      except Exception as e:
        logging.error("unable to start action %s: %s" % (action, str(e)))
        raise
      finally:
        self.lock.release()
      self.currentAction=action
      return True

  def getUpdateSequence(self):
    return self.commandHandler.getUpdateSequence()
  def hasRunningAction(self):
    return self.commandHandler.hasRunningCommand()

  def fetchPackageList(self):
    return self.packageList.fetchPackages()

  def networkAvailable(self,triggerUpdate=True):
    return self.networkChecker.available(triggerUpdate)


  def getAvNavStatus(self):
    now=time.time()
    if self.lastAvNavState is None or ( self.lastAvNavState + 2 ) < now or self.lastAvNavState > now:
      rt=AvNavState.UNCONFIGURED
      states=self.systemd.getUnitInfo([AVNAV_UNIT])
      if len (states) >= 1:
        if states[0][1] == 'running':
          rt= AvNavState.RUNNING
        else:
          rt= AvNavState.STOPPED
      self.lastAvNavState=now
      self.avNavState=rt
    return self.avNavState

def usage():
  print("usage: %s -p port [-l logdir] -h" % (sys.argv[0]))

if __name__ == '__main__':
  try:
    optlist,args=getopt.getopt(sys.argv[1:],'p:l:dh')
  except getopt.GetoptError as err:
    print(err)
    usage()
    sys.exit(1)
  logdir="avnavupdate"#below user Dir
  port=None
  loglevel=logging.INFO
  useHome=False
  for o,a in optlist:
    if o == '-p':
      port=int(a)
    elif o == '-l':
      logdir=a
    elif o == '-d':
      loglevel=logging.DEBUG
    elif o == '-h':
      useHome=True

  if port is None:
    print("missing parameter port")
    sys.exit(1)

  if not os.path.isabs(logdir) and useHome:
    home=os.environ.get('HOME')
    if home is None:
      print("no environment variable HOME is set when starting with -h")
      sys.exit(1)
    logdir=os.path.join(home,logdir)
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
