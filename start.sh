#!/bin/bash

# Start virtual display
Xvfb :1 -screen 0 1024x768x16 &
export DISPLAY=:1

# Start window manager
fluxbox &

# Start VNC server
x11vnc -forever -usepw -display :1 &

# Start the Electron app
npm start