#!/bin/bash
sslPids=`ps aux|grep 'node resign_server.js'|grep -v 'grep'|awk '{print $2}'`
if [ -z "$sslPids" ]
then
	echo 'Ssl resign procedure is empty.'
	cd ./src/
	sudo ../bin/linux/bin/node resign_server.js > ../run.log 2>&1 &
else
	echo 'Ssl resign procedure is not empty'
	ps aux|grep 'node resign_server.js'|grep -v 'grep'|awk '{print $2}'|xargs kill -9
fi;