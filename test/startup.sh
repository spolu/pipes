#!/bin/sh

killall `which node`

echo 'Starting pipes...'
pipes --TINT_NAME=pipes --DEBUG=1 &
sleep 1
echo 'DONE'

pipesctl grant biz/auth-filter.js TEST
pipesreg=`pipesctl register biz/reg-filter.js biz/reg-router.js TEST-REG`
echo "pipes registration: $pipesreg"

#node pipes-listen $pipesreg --DEBUG=1 
