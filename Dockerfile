FROM node:20-slim

# Install dependencies yt-dlp + ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Set workdir
WORKDIR /app

# Copy package.json dan install
COPY package*.json ./
RUN npm install --production

# Copy semua source code
COPY . .

# Buat folder tmp untuk output download
RUN mkdir -p /app/tmp

# Set environment port
ENV PORT=7860

EXPOSE 7860

# Jalankan server
CMD ["node", "index.js"]
