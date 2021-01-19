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
import http.server
import json
import logging
import os
import posixpath
import urllib.parse

from commands import Commands


class Handler(http.server.SimpleHTTPRequestHandler):

  @classmethod
  def getReturnData(cls, error=None, **kwargs):
    if error is not None:
      rt = {'status': error}
    else:
      rt = {'status': 'OK'}
    for k in list(kwargs.keys()):
      if kwargs[k] is not None:
        rt[k] = kwargs[k]
    return rt

  @classmethod
  def pathQueryFromUrl(cls, url):
    (path, sep, query) = url.partition('?')
    path = path.split('#', 1)[0]
    path = posixpath.normpath(urllib.parse.unquote(path))
    return (path, query)

  @classmethod
  def getRequestParam(cls,query):
    return urllib.parse.parse_qs(query, True)

  def getBaseDir(self):
    return os.path.join(os.path.dirname(__file__),'..','gui')


  def log_message(self, format, *args):
    logging.debug(format, *args)


  def translate_path(self, path):
    """Translate a /-separated PATH to the local filename syntax.

            Components that mean special things to the local file system
            (e.g. drive or directory names) are ignored.  (XXX They should
            probably be diagnosed.)

            """
    # abandon query parameters
    path = path.split('?', 1)[0]
    path = path.split('#', 1)[0]
    # Don't forget explicit trailing slash when normalizing. Issue17324
    trailing_slash = path.rstrip().endswith('/')
    try:
      path = urllib.parse.unquote(path, errors='surrogatepass')
    except UnicodeDecodeError:
      path = urllib.parse.unquote(path)
    path = posixpath.normpath(path)
    words = path.split('/')
    words = filter(None, words)
    path = self.getBaseDir()
    for word in words:
      if os.path.dirname(word) or word in (os.curdir, os.pardir):
        # Ignore components that are not a simple file/directory name
        continue
      path = os.path.join(path, word)
    if trailing_slash:
      path += '/'
    return path

  def sendJsonResponse(self,data):
    r=json.dumps(data).encode('utf-8')
    self.send_response(200)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(r)))
    self.send_header("Last-Modified", self.date_time_string())
    self.end_headers()
    self.wfile.write(r)



  def do_GET(self):
    if not self.path.startswith("/api"):
      return super().do_GET()
    (request,query)=self.pathQueryFromUrl(self.path)
    request=request[len("/api/"):]
    requestParam=self.getRequestParam(query)
    if request.endswith("/"):
      request=request[:-1]

    if request == 'ping':
      self.sendJsonResponse(self.getReturnData())
      return
    if request == 'status':
      self.sendJsonResponse(self.getReturnData(
        actionRunning=self.server.hasRunningAction(),
        currentAction=self.server.currentAction,
        avnavRunning=self.server.getAvNavStatus(),
        updateSequence=self.server.getUpdateSequence()
      ))
      return
    if request in Commands.KNOWN_ACTIONS:
      parameters=None
      if request == 'updatePackages':
        packageList=requestParam.get('package')
        if packageList is None or len(packageList) < 1:
          self.sendJsonResponse(self.getReturnData("missing parameter package"))
          return
        parameters=packageList
      logging.info("run command %s",request)
      try:
        success=self.server.startAction(request,parameters)
        if success:
          self.sendJsonResponse(self.getReturnData(info="started"))
        else:
          self.sendJsonResponse(self.getReturnData("another action is running"))
        return
      except Exception as e:
        self.sendJsonResponse(self.getReturnData("Error: %s"%str(e)))
        return

    if request == 'fetchList':
      data=self.server.fetchPackageList()
      self.sendJsonResponse(self.getReturnData(data=data))
      return
    self.sendJsonResponse(self.getReturnData("unknown request %s"%request))





