#! /bin/bash


err(){
    echo "ERROR: $*"
    exit 1
}

SCRIPT="`dirname $0`/../../../plugin.sh"

[ "$1" == "" ] &&  err "usage: $0 package [package...]"
[ ! -f "$SCRIPT" ] && err "script $SCRIPT not found"

dpkg-query -W -f '${Package}:${avnav-plugin}:${avnav-hidden}\n' $* | grep -i 'true *$' | while read info
do
    IFS=":" read -ra AR <<< "$info"
    echo "syncing hidden ${AR[0]}:${AR[1]}"
    if [ "${AR[1]}" != "" ] ; then
      "$SCRIPT" hideIf "${AR[1]}" || err "error executing $SCRIPT"
    fi
done
