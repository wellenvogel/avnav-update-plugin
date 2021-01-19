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
import apt_pkg

class NV:
  def __init__(self,**kwargs):
    for k,v in kwargs.items():
      self.__setattr__(k,v)

  def dict(self):
    return self.__dict__

class PackageList:
  def __init__(self,prefix):
    self.prefix=prefix

  @classmethod
  def state_str(cls,state):
    if state in [apt_pkg.CURSTATE_CONFIG_FILES, apt_pkg.CURSTATE_HALF_CONFIGURED, apt_pkg.CURSTATE_HALF_INSTALLED]:
      return "invalid"
    if state in [apt_pkg.CURSTATE_INSTALLED]:
      return "installed"
    return "unknown"


  def fetchPackages(self):
    apt_pkg.init_config()
    apt_pkg.init_system()
    cache = apt_pkg.Cache()
    depcache =apt_pkg.DepCache(cache)
    rt=[]
    for pkg in cache.packages:
      if pkg.name.startswith(self.prefix):
        cand = depcache.get_candidate_ver(pkg)
        candVersion=None
        current=pkg.current_ver.ver_str if pkg.current_ver else ''
        if cand and cand.ver_str != current:
          candVersion=cand.ver_str
        nv=NV(name=pkg.name,state=self.state_str(pkg.current_state),version=current,candidate=candVersion)
        rt.append(nv.dict())
    return rt