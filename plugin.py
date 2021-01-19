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
from urllib.request import urlopen


class Plugin(object):
  CONFIG = [

          ]
  SERVICE_CFG='/etc/avnav-updater'
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
    port=None
    cfg=self.api.getConfigValue('config',self.SERVICE_CFG)
    if os.path.exists(cfg):
      try:
        with open(cfg,"r",encoding='utf-8') as f:
          for line in f:
            line=line.rstrip().lstrip()
            line=re.sub('#.*','',line)
            if not line.startswith('PORT'):
              continue
            par=re.split(" *= *",line)
            if len(par) >= 2:
              port=int(par[1])
              break
      except Exception as e:
        self.api.setStatus("ERROR","unable to parse %s: %s"%(self.SERVICE_CFG,str(e)))
    else:
      self.api.setStatus("INACTIVE","plugin service %s not installed"%self.SERVICE_CFG)
      return
    if port is None:
      self.api.setStatus("INACTIVE","unable to get PORT from %s"%self.SERVICE_CFG)
      return
    connected=False
    url="http://localhost:%d"%port
    pingUlr=url+"/api/ping"
    self.api.setStatus("STARTING", "trying to connect at port %d" % port)
    try:
      self.api.registerUserApp("http://$HOST:%d/index.html?title=none"%port,os.path.join('gui','icons','system_update.svg'),title="AvNav Updater")
    except Exception as e:
      self.api.setStatus("ERROR","unable to register user app: %s"%str(e))
      return
    while True:
      try:
        r=urlopen(pingUlr,timeout=5)
        res=json.loads(r.read())
        if res.get('status') != 'OK':
          self.api.setStatue("ERROR","invalid response from service: %s",res.get('STATUS'))
        else:
          connected=True
          self.api.setStatus("NMEA", "service running at port %d" % port)
      except Exception as e:
        self.api.setStatus("ERROR","error connecting to %s: %s"%(pingUlr,str(e)))
        connected=False
      time.sleep(2)


