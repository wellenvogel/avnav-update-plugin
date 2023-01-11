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
import logging
import re



class NV:
  def __init__(self,**kwargs):
    self.version=None
    self.candidate=None
    self.state=None
    for k,v in kwargs.items():
      self.__setattr__(k,v)
  def set(self,n,v):
    self.__setattr__(n,v)

  def dict(self):
    return self.__dict__

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
  def fetchPackages(self):
    CMD=["apt-cache","policy",self.prefix+"*"]
    res=subprocess.run(CMD,capture_output=True,timeout=10)
    if res.returncode != 0:
      raise Exception("unable to run %s"%" ".join(CMD))
    rt={}  
    pkg=None
    pkgData=NV()  
    for line in res.stdout.splitlines():
      line=line.decode("utf-8",errors="ignore")
      if re.match("^"+self.prefix+".*:",line):
        if pkg is not None:
          rt[pkg]=pkgData
        pkg=re.sub(":.*","",line)
        pkgData=NV(name=pkg)
      else:
        if pkg is None:
          continue
        for key,pattern in self.PATTERNS.items():
          if (re.match(pattern,line)):
            v=re.sub(pattern,"",line)
            pkgData.set(key,v)
    if pkg is not None:
      rt[pkg]=pkgData
    for pkg in rt.keys():
      version=rt[pkg].version
      if version is None or version == "(none)":
        rt[pkg].state="invalid"
        rt[pkg].version=None
      else:
        rt[pkg].state="installed"
      if rt[pkg].version == rt[pkg].candidate:
        rt[pkg].candidate=None  
    rtlist=[]
    for k,pkg in rt.items():
      if self.installedOnlyPrefix is not None and k.startswith(self.installedOnlyPrefix):
        if pkg.version is None or pkg.version == '':
          continue
      if k in self.blackList:
        continue  
      rtlist.append(pkg.dict())
    logging.debug("fetchPackageList: %s",str(rtlist))
    return rtlist


if __name__ == '__main__':
  pl=PackageList("avnav","avnav-raspi",blackList=['avnav-oesenc'])
  lst=pl.fetchPackages()
  print(lst)