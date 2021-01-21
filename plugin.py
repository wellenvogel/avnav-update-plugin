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
#  Software is furnished to do so, subject to the following conditions:self.SERVICE_CFG
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
import json
import os
import re
import time
import urllib.parse
from http import HTTPStatus
from urllib.request import urlopen
import pydbus


class Plugin(object):
  CONFIG = [

          ]
  @classmethod
  def pluginInfo(cls):
    """
    the description for the module
    @return: a dict with the content described below
            parts:
               * description (mandatory)
               * data: list of keys to be stored (optional)
                 * path - the key - see AVNApi.addData, all pathes starting with "gps." will be sent to the GUI
                 * description
    """
    return {
      'description': 'avnav update plugin',
      'version': '1.0'
    }

  def __init__(self,api):
    """
        initialize a plugins
        do any checks here and throw an exception on error
        do not yet start any threads!
        @param api: the api to communicate with avnav
        @type  api: AVNApi
    """
    self.api = api # type: AVNApi
    self.api.registerRequestHandler(self.requestHandler)
    self.updaterPort=None
    self.findError=None
    self.isConnected=False


  def _findServicePort(self):
    port=None
    try:
      BUSNAME = 'org.freedesktop.systemd1'
      UNITNAME = 'avnavupdater.service'
      bus = pydbus.SystemBus()
      systemd = bus.get(
        BUSNAME,
        '/org/freedesktop/systemd1'
      )
      manager = systemd['org.freedesktop.systemd1.Manager']
      unit = manager.GetUnit(UNITNAME)
      extended = bus.get(BUSNAME, unit)
      env=extended.Environment
      for e in env:
        nv=e.split("=",2)
        if len(nv) > 1 and nv[0] == 'PORT':
          port=int(nv[1])
          break
      if port is None:
        self.findError="no port found for updater"
    except Exception as e:
      self.findError=str(e)
    if port is None:
      self.api.setStatus("ERROR", "unable to get updater port: %s" % self.findError)
    self.updaterPort = port


  def run(self):
    """
    the run method
    this will be called after successfully instantiating an instance
    this method will be called in a separate Thread
    The example simply counts the number of NMEA records that are flowing through avnav
    and writes them to the store every 10 records
    @return:
    """
    seq=0
    self.api.log("started")
    self.api.setStatus("INACTIVE","starting")
    self.isConnected=False
    self.api.setStatus("STARTING", "started")
    try:
      self.api.registerUserApp(self.api.getBaseUrl()+"/api/index",os.path.join('gui','icons','system_update.svg'),title="AvNav Updater")
    except Exception as e:
      self.api.setStatus("ERROR","unable to register user app: %s"%str(e))
      return
    while True:
      self._findServicePort()
      if self.updaterPort:
        url = "http://localhost:%d" % self.updaterPort
        pingUlr = url + "/api/ping"
        try:
          r=urlopen(pingUlr,timeout=5)
          res=json.loads(r.read())
          if res.get('status') != 'OK':
            self.api.setStatue("ERROR","invalid response from service: %s",res.get('STATUS'))
          else:
            self.isConnected=True
            self.api.setStatus("NMEA", "service running at port %d" % self.updaterPort)
        except Exception as e:
          self.api.setStatus("ERROR","error connecting to %s: %s"%(pingUlr,str(e)))
          self.isConnected=False
      else:
        self.api.setStatus("ERROR","unable to find updater service port")
      time.sleep(2)

  def requestHandler(self, url, handler, args):
    '''
    handle api requests
    @param url:
    @param handler:
    @param args:
    @return:
    '''
    if url == 'index':
      if self.updaterPort is None or not self.isConnected:
        error = self.findError if self.updaterPort is None else "updater not available at port %s"%self.updaterPort
        r=("<h1> unable to find updater service</h1><p>%s</p>"%error or '').encode('utf-8')
        handler.send_response(200)
        handler.send_header("Content-Type", "text/html")
        handler.send_header("Content-Length", str(len(r)))
        handler.send_header("Last-Modified", handler.date_time_string())
        handler.end_headers()
        handler.wfile.write(r)

      else:
        parts = urllib.parse.urlsplit(handler.path)
        handler.send_response(HTTPStatus.MOVED_PERMANENTLY)
        hostport=handler.headers.get('host')
        hostport=re.sub(':[^:\]]*$','',hostport)
        hostport+=':'+str(self.updaterPort)
        if parts[0] == '':
          proto="http"
        else:
          proto=parts[0]
        new_parts = (proto, hostport, '/index.html',None,None)
        new_url = urllib.parse.urlunsplit(new_parts)
        handler.send_header("Location", new_url)
