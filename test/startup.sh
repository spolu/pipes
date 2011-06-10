#!/bin/sh

killall `which node`

echo 'Starting pipe...'
pipe --TINT_NAME=pipe --DEBUG=1 &
sleep 1
echo 'DONE'

pipectl grant biz/auth-filter.js TEST
pipereg=`pipectl register biz/reg-filter.js biz/reg-router.js TEST-REG`
echo "pipe registration: $pipereg"

#node pipe-listen $pipereg --DEBUG=1 
