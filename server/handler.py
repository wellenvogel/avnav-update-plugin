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
import datetime
import http.server
import json
import logging
import os
import posixpath
import shutil
import time
import urllib.parse
from http import HTTPStatus

from commands import Commands


class Handler(http.server.SimpleHTTPRequestHandler):
  protocol_version = "HTTP/1.1" #necessary for websockets!

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

  def sendTextFile(self,filename,attachment=None,maxBytes=None):
    if filename is None or not os.path.exists(filename):
      self.send_response(404,'not found')
      self.end_headers()
      return
    try:
      with open(filename,'rb') as f:
        self.send_response(HTTPStatus.OK)
        if attachment is not None:
          self.send_header('Content-Disposition',
                           'attachment;filename="%s"'%attachment)
        self.send_header("Content-type", 'text/plain')
        fs = os.fstat(f.fileno())
        seekBytes=0
        flen=fs[6]
        if maxBytes is not None:
          seekBytes=flen-maxBytes
          if seekBytes < 0:
            seekBytes=0
          flen-=seekBytes
          if seekBytes > 0:
            f.seek(seekBytes)
        self.send_header("Content-Length", str(flen))
        self.send_header("Last-Modified", self.date_time_string())
        self.end_headers()
        shutil.copyfileobj(f,self.wfile)
        self.wfile.close()
        return
    except:
      pass
    self.send_response(404, 'not found')
    self.end_headers()

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
      triggerNetworkUpdate=False
      if requestParam.get('includeNet'):
        triggerNetworkUpdate=True
      status=self.server.getStatus(triggerNetworkUpdate)
      status.update(self.getReturnData())
      self.sendJsonResponse(status)
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
    if request == 'getLog':
      maxSize=requestParam.get('maxSize')
      if maxSize is not None and len(maxSize) > 0:
        maxSize=int(maxSize[0])
      state=self.server.getAvNavStatus()
      self.sendTextFile(state.getLogFile(),maxBytes=maxSize)
      return
    if request == 'getConfig':
      state=self.server.getAvNavStatus()
      self.sendTextFile(state.getConfigFile())
      return
    if request == 'downloadLog':
      state = self.server.getAvNavStatus()
      self.sendTextFile(state.getLogFile(),"avnav-%s.log"%
                        (datetime.datetime.now().strftime("%Y%m%d")))
      return
    if request == 'downloadConfig':
      state = self.server.getAvNavStatus()
      self.sendTextFile(state.getConfigFile(),"avnav_server-%s.xml"%
                        (datetime.datetime.now().strftime("%Y%m%d")))
      return
    self.sendJsonResponse(self.getReturnData("unknown request %s"%request))

  def do_POST(self):
    if not self.path.startswith("/api/uploadConfig"):
      self.sendJsonResponse(self.getReturnData("unknown request %s" % request))
      return
    MAXSIZE=1000000
    l=self.headers.get('Content-Length')
    if l is None:
      self.sendJsonResponse(self.getReturnData("missing content-length"))
      return
    dlen=int(l)
    if dlen > MAXSIZE:
      self.sendJsonResponse(self.getReturnData("upload too big: current=%d, allowed=%d"%(dlen,MAXSIZE)))
      return
    type=self.headers.get('Content-Type')
    if type != 'text/plain' and type != 'application/octet-stream':
      self.sendJsonResponse(self.getReturnData("invalid content type %s"%type))
    buffer=self.rfile.read(dlen)
    if len(buffer) != dlen:
      self.sendJsonResponse(self.getReturnData("only %d bytes of %d received"%(len(buffer),dlen)))
      return
    status=self.server.getAvNavStatus()
    outfname=status.getConfigFile(checkExistance=False)
    now = datetime.datetime.utcnow()
    suffix="-" + now.strftime("%Y%m%d%H%M%S")
    tmpfile=outfname+".tmp"+suffix
    if os.path.exists(tmpfile):
      self.sendJsonResponse(self.getReturnData("temp file %s already exists, try again"%tmpfile))
      return
    dir=os.path.dirname(outfname)
    if not os.path.isdir(dir):
      self.sendJsonResponse(self.getReturnData("config dir %s does not exist" % dir))
      return
    for fitem in [outfname,dir]:
      if not os.access(outfname,os.W_OK):
        self.sendJsonResponse(self.getReturnData("unable to write" % fitem))
        return
    try:
      with open(tmpfile,"wb") as tmp:
        wlen=tmp.write(buffer)
        if wlen != dlen:
          raise Exception("unable to write all bytes to %s"%tmpfile)
        tmp.close()
      if os.path.exists(outfname):
        copyname=outfname + suffix
        shutil.copyfile(outfname,copyname)
        logging.debug("copied config %s to %s",outfname,copyname)
      logging.debug("updating config %s with len %d",outfname,dlen)
      os.replace(tmpfile,outfname)
    except Exception as e:
      try:
        os.remove(tmpfile)
      except:
        pass
      self.sendJsonResponse(self.getReturnData(str(e)))
    self.sendJsonResponse(self.getReturnData())



