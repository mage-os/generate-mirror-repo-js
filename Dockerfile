FROM node:16.14-alpine3.14 AS node

FROM composer/satis as build

COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

ENV NODE_ENV=production

WORKDIR /generate-repo

COPY . /generate-repo

RUN mkdir /generate-repo/repositories && chmod 0777 /generate-repo/repositories && chmod -R 0777 /satis/vendor/composer

ENTRYPOINT ["/generate-repo/bin/docker-entrypoint.sh"]
