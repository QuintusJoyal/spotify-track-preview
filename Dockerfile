FROM node:22.2.0-slim

RUN apt-get update -y &&\
    apt-get install -y ffmpeg

RUN npm i -g pnpm

WORKDIR /app

EXPOSE 3000

