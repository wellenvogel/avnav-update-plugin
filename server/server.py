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
from itertools import groupby
import logging.handlers
import os
import socketserver
import sys
import threading
import time
import traceback
import gc
import tracemalloc

from commands import Commands
from handler import Handler
from network import NetworkChecker
from simplequeue import SimpleQueue
from systemd import Systemd
from websocket import HTTPWebSocketsHandler
from packagelist import PackageList




class WSConsole(HTTPWebSocketsHandler, Handler):



  @classmethod
  def send_queue_len(cls):
    return 0 #we have an own sender thread

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
    self.log_message('%s', 'websocket connected')
    writer=threading.Thread(target=self._fetchFromQueue)
    writer.setDaemon(True)
    writer.start()

  def on_ws_closed(self):
    self.log_message('%s', 'websocket closed')

  def _fetchFromQueue(self):
    sequence=self.server.console.getStartSequence()
    while self.connected:
      sequence,message=self.server.console.read(sequence,0.5)
      if message is not None:
        self.send_message(message)


AVNAV_UNIT="avnav.service"

class AvNavState(object):
  RUNNING=1
  STOPPED=2
  UNCONFIGURED=3
  FILE_STATE_NE="nonexistent"
  FILE_STATE_R="read"
  FILE_STATE_W="write"

  def __init__(self,state=UNCONFIGURED,workdir=None):
    self.state=state
    self.workdir=workdir

  def __str__(self) -> str:
    return "AvNav info state=%d, workdir=%s"%(self.state,str(self.workdir))

  def getConfigFile(self,checkExistance=True):
    if self.workdir is None:
      return None
    fname=os.path.join(self.workdir,'avnav_server.xml')
    if not checkExistance or os.path.exists(fname):
      return fname
  def configFileState(self):
    fn=self.getConfigFile()
    if fn is None:
      return self.FILE_STATE_NE
    if os.access(fn,os.W_OK):
      return self.FILE_STATE_W
    if os.access(fn,os.R_OK):
      return self.FILE_STATE_R
    return self.FILE_STATE_NE

  def getLogFile(self,checkExistance=True):
    if self.workdir is None:
      return None
    fname=os.path.join(self.workdir,'log','avnav.log')
    if not checkExistance or os.path.exists(fname):
      return fname


testDir=None

class OurHTTPServer(socketserver.ThreadingMixIn,http.server.HTTPServer):
  def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
    http.server.HTTPServer.__init__(self,server_address,RequestHandlerClass,bind_and_activate)
    self.actionRunning=False
    self.currentAction=None
    self.packageList=PackageList('avnav','avnav-raspi',blackList=['avnav-oesenc'])
    self.systemd=Systemd()
    self.lastAvNavState=None
    self.avNavState=AvNavState()
    self.commandHandler=Commands(self._logCommand)
    self.networkChecker=NetworkChecker('www.google.de',checkInterval=20)
    self.networkChecker.available()
    self.console=SimpleQueue(500)
    self.daemon_threads=True

  def handle_error(self, request, client_address):
    estr=traceback.format_exc()
    logging.error("error in http request from %s: %s",str(client_address),estr)

  def _logCommand(self,msg):
    logging.info("[COMMAND]:%s"%msg)
    self.console.add(msg)

  def clearConsole(self):
    self.console.clear()

  def startAction(self,action,parameters=None):
    if action in self.commandHandler.KNOWN_ACTIONS:
      try:
        started=self.commandHandler.runAction(action, parameters, startcallback=self.clearConsole)
        if not started:
          logging.error("unable to start action %s: another action is already running",action)
          return False
      except Exception as e:
        logging.error("unable to start action %s: %s" % (action, str(e)))
        raise
      self.currentAction=action
      return True

  def fetchPackageList(self):
    return self.packageList.fetchPackages()

  def getStatus(self,triggerNetworkUpdate):
    avNavState=self.getAvNavStatus()
    return {
      'actionRunning': self.commandHandler.hasRunningCommand(),
      'currentAction': self.currentAction,
      'avnavRunning': avNavState.state,
      'updateSequence': self.commandHandler.getUpdateSequence(),
      'network':self.networkChecker.available(triggerNetworkUpdate),
      'logFile': 'read' if avNavState.getConfigFile() is not None else 'nonexistent',
      'configFile': avNavState.configFileState()
    }

  def getAvNavStatus(self):
    now=time.time()
    if self.lastAvNavState is None or ( self.lastAvNavState + 2 ) < now or self.lastAvNavState > now:
      self.lastAvNavState = now
      logging.debug("fetch AvNav state")
      infos=self.systemd.getUnitInfo([AVNAV_UNIT])
      if len(infos) > 0:
        info=infos[0]
        logging.debug("found avnav info from systemd")
        state=AvNavState.UNCONFIGURED
        if info.status == 'running':
          state= AvNavState.RUNNING
        else:
          state= AvNavState.STOPPED
        workdir = None
        if info.commandline is not None:
          #find the -b parameter
          lastIsB=False
          for p in info.commandline[1:]:
            if lastIsB:
              workdir=p
              break
            if p == '-b':
              lastIsB=True
              continue
        self.avNavState=AvNavState(state,workdir)
        logging.debug("AvNav %s", str(self.avNavState))
      else:
        if testDir is not None:
          self.avNavState=AvNavState(workdir=testDir)
    return self.avNavState

def usage():
  print("usage: %s -p port [-l logdir] -h" % (sys.argv[0]))


def monitor():
  tracemalloc.start(10)
  gc.set_debug(gc.DEBUG_LEAK)
  filters=[tracemalloc.Filter(False, tracemalloc.__file__),tracemalloc.Filter(False,__file__,lineno=231),tracemalloc.Filter(False,__file__,lineno=236)] 
  snapshot=tracemalloc.take_snapshot().filter_traces(filters)
  lastSize=0
  while True:
    time.sleep(10)
    gc.collect()
    current=tracemalloc.take_snapshot().filter_traces(filters)
    stats=current.compare_to(snapshot,"lineno",cumulative=True)
    size,peak=tracemalloc.get_traced_memory()
    tracemalloc.reset_peak()
    print("TRACEMALLOC, current=%d (changed=%d), peak=%d"%(size,size-lastSize,peak))
    lastSize=size
    overall=0
    for x in stats:
      if x.size_diff != 0:
        overall+=x.size_diff
        print("SizeDiff=%d,Traceback=%s"%(x.size_diff,str(x.traceback)))
    print("TRACEMALLOC diff=%d"%overall)    
    snapshot=current  


if __name__ == '__main__':
  try:
    optlist,args=getopt.getopt(sys.argv[1:],'p:l:dht:m')
  except getopt.GetoptError as err:
    print(err)
    usage()
    sys.exit(1)
  logdir="avnavupdate"#below user Dir
  port=None
  loglevel=logging.INFO
  useHome=False
  runTmalloc=False
  for o,a in optlist:
    if o == '-p':
      port=int(a)
    elif o == '-l':
      logdir=a
    elif o == '-d':
      loglevel=logging.DEBUG
    elif o == '-h':
      useHome=True
    elif o == '-t':
      testDir=a
    elif o == '-m':
      runTmalloc=True  

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
  if runTmalloc:
    t=threading.Thread(target=monitor)
    t.daemon=True
    t.start()

  try:
    server=OurHTTPServer(('0.0.0.0',port), WSConsole)
    server.serve_forever()
  except Exception as e:
    logging.error("Startup failed with exception: %s",str(e))
    time.sleep(3)
    sys.exit(1)
  logging.info("AvNav finishing")

