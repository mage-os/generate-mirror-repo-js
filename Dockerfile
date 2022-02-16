FROM node:16.14-alpine3.14 AS node

FROM composer/satis as build

COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

ENV NODE_ENV=production

WORKDIR /repo-generator

COPY . /repo-generator

RUN mkdir /repo-generator/repositories && chmod 0777 /repo-generator/repositories && chmod -R 0777 /satis/vendor/composer

ENTRYPOINT ["/repo-generator/bin/docker-entrypoint.sh"]
