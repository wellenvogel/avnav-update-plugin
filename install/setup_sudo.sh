#!/usr/bin/env bash
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

pdir=`dirname $0`
if [ "$USER" = "" ] ; then
    echo "user environment variable not set"
    exit 1
fi
echo "user=$USER"
src="$pdir/avnavupdate"
if [ ! -f "$src" ] ; then
    echo "$src not found"
    exit 1
fi
dst=/etc/sudoers.d
if [ ! -d "$dst" ] ; then
    echo "directory $dst not found"
    exit 1
fi
dfile=$dst/avnavupdate

if [ -f "$dfile" ] ; then
    rm -f $dfile
fi
sed -e "s/#USER#/$USER/" "$src" > "$dfile"
if [ $? != 0 ] ; then
    echo "unable to write to $dfile"
    exit 1
fi

chown root $dfile
chmod 644 $dfile

ntpdate pool.ntp.org
if [ $? = 0 ] ; then
    update-ca-certificates
else
    echo "unable to reach time server, no update of certificates"    
fi
exit 0

