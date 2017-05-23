FROM node:boron

ENV NODE_ENV=production

RUN adduser --disabled-login --uid 1001 --gid 1001 --gecos 'App1' app1

RUN mkdir /app1
WORKDIR /app1

ADD package.json /app1/package.json
ADD yarn.lock /app1/yarn.lock
RUN yarn

ADD . /app1
RUN chown -hR app1:app1 /app1
USER app1

EXPOSE 3000
VOLUME ["./db:/app1/db"]
CMD ["npm", "start"]
