#!/bin/bash
# start FlaskBB on :5000
cd /home/sandbox/qa/app
. ../v12/bin/activate
pkill -f "flaskbb.*run" 2>/dev/null; sleep 1
cp ../seed.sqlite flaskbb.sqlite
setsid nohup flaskbb --config $PWD/flaskbb.cfg run --no-reload --no-debugger -p 5000 -h 127.0.0.1 > ../app.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:5000/ && exit 0; sleep 1; done; exit 1
