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
import functools
import subprocess
import logging
import re
import os
import sys
import apt
import apt_pkg

APT_DIR="/etc/apt/sources.list.d"
BETA_ACTIVE="extra-beta.sources"
BETA_INACTIVE=BETA_ACTIVE+".disabled"
BETA_DEFAULT_PATTERN="debpreview"

#beta states

BS_NONE="inactive"
BS_ACTIVE="active"
BS_INACT_MOD="inactive-mod"
BS_ACTIVE_MOD="active-mod"

class NamePattern(apt.cache.Filter):
  def __init__(self, pattern):
    self.pattern = pattern
  def apply(self, pkg):
    return pkg.name.startswith(self.pattern)
class NV:
  def __init__(self,**kwargs):
    self.version=None
    self.candidate=None
    self.state=None
    self.disabled=False
    self.plugin=None
    for k,v in kwargs.items():
      self.__setattr__(k,v)
  def set(self,n,v):
    self.__setattr__(n,v)

  def dict(self):
    return self.__dict__

class PInfo:
  def __init__(self) -> None:
    self.plugin=None
    self.disabled=None # '0' or '1'
    self.hidden=False

class PackageList:
  def __init__(self,prefix,installedOnlyPrefix=None,blackList=[]):
    self.prefix=prefix
    self.installedOnlyPrefix=installedOnlyPrefix
    self.blackList=blackList

  @classmethod
  def state_str(cls,state):
    if state in ["(none)"]:
      return "invalid"
    return "installed"
  

  PATTERNS={
    "version":"^  *Installed: *",
    "candidate":"^  *Candidate: *"
  }

  @classmethod
  def piNameToVar(self,name):
    try:
      return re.sub("[^0-9a-zA-Z]","",name).upper()
    except:
      return name

  @classmethod
  def getPluginScript(cls):
    script=os.path.abspath(os.path.join(os.path.dirname(__file__),os.pardir,os.pardir,os.pardir,"plugin.sh"))
    logging.debug("scriptPath=%s",script)
    return script  
  
  @classmethod  
  def getPluginHiddenState(cls):
    script=cls.getPluginScript()
    disabledPlugins={}
    if os.path.exists(script):
      cmd=[script,"list"]  
      res=subprocess.run(cmd,capture_output=True,shell=False)
      if res.returncode != 0:
        logging.error("execution of %s returned %d"%(" ".join(cmd),res.returncode))
      else:
        for line in res.stdout.splitlines(): 
          line=line.decode("utf-8",errors="ignore")
          parts=line.split("=")
          if len(parts) != 2:
            continue
          disabledPlugins[parts[0].rstrip()]=parts[1].rstrip().lstrip()
    return disabledPlugins

  def getBetaPattern(self):
    pattern=None
    for f in [BETA_ACTIVE,BETA_INACTIVE]:
      if os.path.exists(os.path.join(APT_DIR,f)):
        logging.debug("found beta file: %s"%(f))
        try:
          with open(os.path.join(APT_DIR,f),"r") as wf:
            for line in wf:
              line=line.strip()
              if line.startswith("URIs"):
                pattern=re.sub("^URIs: *","",line)
                logging.debug("found beta pattern: %s"%(pattern))
        except Exception as e:
          logging.error("error reading beta pattern from %s: %s"%(f,str(e)))
        break
    return pattern
    
  def fetchPackages(self):
    betaPattern=self.getBetaPattern()
    canChangeBeta=True
    if betaPattern is None:
      canChangeBeta=False
      betaPattern=BETA_DEFAULT_PATTERN 
    disabledPlugins=self.getPluginHiddenState()  
    cache=None
    try:
      cache=apt.cache.Cache()
      fcache=apt.cache.FilteredCache(cache)
      fcache.set_filter(NamePattern(self.prefix))
      rt={}
      for k in fcache.keys():
        p=cache.get(k)
        pkgData=NV(name=p.name,
                   beta=BS_INACT_MOD if canChangeBeta else BS_NONE,
                   version=p.installed.version if p.installed else None,
                   candidate=p.candidate.version if p.candidate else None,
                   state='installed' if p.installed else 'invalid')
        versions=[]
        hasBeta=False
        if p.versions:
          for version in p.versions:
            if version.version == pkgData.version:
              #check plugin data
              plugin=version.record.get('avnav-plugin')
              hidden=version.record.get('avnav-hidden')
              if plugin is not None:
                plugin=self.piNameToVar(plugin)
                disabled=disabledPlugins.get(plugin)
                pkgData.plugin=plugin
                pkgData.disabled=disabled
              pkgData.hidden=hidden
              continue
            if len(version.uris)>0:
              vstate=apt_pkg.version_compare(version.version,pkgData.version) if (pkgData.version is not None) else None
              versions.append({'state':vstate,'version':version.version})
            if any(map(lambda v: betaPattern in v, version.uris)):
              hasBeta=True
        versions.sort(key=functools.cmp_to_key(lambda a,b: apt_pkg.version_compare(a['version'],b['version'])),reverse=True)
        pkgData.versions=versions
        pkgData.beta=BS_ACTIVE_MOD if hasBeta and canChangeBeta else (BS_ACTIVE if hasBeta else pkgData.beta)
        rt[k]=pkgData
        logging.debug(f"processed package: {k} with data: {pkgData}")
      rtlist=[]
      for k,pkg in rt.items():
        if self.installedOnlyPrefix is not None and k.startswith(self.installedOnlyPrefix):
          if pkg.version is None or pkg.version == '':
            continue
        if k in self.blackList:
          continue  
        rtlist.append(pkg.dict())
      logging.debug("fetchPackageList: %s",str(rtlist))
    finally:
      if cache is not None:
        cache.close()
    return rtlist


if __name__ == '__main__':
  if len(sys.argv) > 1:
    logging.basicConfig(level=int(sys.argv[1]))
  pl=PackageList("avnav","avnav-raspi*",blackList=['avnav-oesenc'])
  lst=pl.fetchPackages()
  print(lst)