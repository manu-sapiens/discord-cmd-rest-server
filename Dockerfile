FROM node:20-bullseye

# Install required dependencies for Electron and VNC
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    x11vnc \
    xvfb \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Add VNC startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Set up VNC password
RUN mkdir ~/.vnc && x11vnc -storepasswd password ~/.vnc/passwd

# Expose VNC and app ports
EXPOSE 5900 3037

CMD ["/start.sh"]
