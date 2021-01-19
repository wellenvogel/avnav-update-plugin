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
import subprocess
import threading
import time


class Commands:
  def __init__(self,stdoutLogger,stderrLogger=None,finishCallback=None):
    self.stdoutLogger=stdoutLogger
    self.stderrLogger=stderrLogger or stdoutLogger
    self.runningCommand=None
    self.lastReturn=None
    self.finishCallback=finishCallback

  KNOWN_ACTIONS={
      'updateList':['sudo','-n','apt-get','update'],
      'restart':['sudo','-n','systemctl','restart','avnav'],
       }

  def runAction(self,action,autoCheck=True):
    commands=self.KNOWN_ACTIONS.get(action)
    if commands is None:
      return False
    return self.runCommand(commands,autoCheck)


  def runCommand(self,command,autoCheck=True):
    try:
      if self.runningCommand is not None:
        raise Exception("another command is already running")
      self.stdoutLogger("starting %s"%" ".join(command))
      stderr=subprocess.PIPE if self.stderrLogger != self.stdoutLogger else subprocess.STDOUT
      self.runningCommand=subprocess.Popen(command,close_fds=True,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=stderr)
    except Exception as e:
      self.stderrLogger("Exception when starting %s:%s"%(" ".join(command),str(e)))
      return False
    stdoutReader=threading.Thread(target=self._readStdout)
    stdoutReader.setDaemon(True)
    stdoutReader.start()
    if self.stdoutLogger != self.stderrLogger:
      stderrReader=threading.Thread(target=self._readStderr)
      stderrReader.setDaemon(True)
      stderrReader.start()
    if autoCheck:
      checker=threading.Thread(target=self._autoCheck)
      checker.setDaemon(True)
      checker.start()
    return True

  def _autoCheck(self):
    while True:
      if not self.hasRunningCommand():
        return
      rt=self.checkRunning()
      if rt is not None:
        self.stdoutLogger("command finished with return code %d"%rt)
        return
      time.sleep(0.2)

  def _readStdout(self):
    while True:
      line=self.runningCommand.stdout.readline()
      if len(line) == 0:
        break
      self.stdoutLogger(line)

  def _readStderr(self):
    while True:
      line = self.runningCommand.stderr.readline()
      if len(line) == 0:
        break
      self.stdoutLogger(line)

  def hasRunningCommand(self):
    return self.runningCommand is not None

  def checkRunning(self):
    if not self.runningCommand:
      return
    rt=self.runningCommand.poll()
    if rt is None:
      return
    self.lastReturn=rt
    self.runningCommand=None
    if self.finishCallback is not None:
      self.finishCallback(rt)
    return rt
