FROM node:16.14-alpine3.14 AS node

FROM composer/satis as build

COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

ENV NODE_ENV=production

ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/

ENV IPE_GD_WITHOUTAVIF=1
RUN chmod +x /usr/local/bin/install-php-extensions && \
    install-php-extensions bcmath gd intl pdo_mysql soap xsl

WORKDIR /generate-repo

COPY . /generate-repo
RUN chmod -R 0777 /satis/views

RUN mkdir /generate-repo/repositories && chmod 0777 /generate-repo/repositories && chmod -R 0777 /satis/vendor/composer

RUN curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar -o /usr/local/bin/php-classes.phar
RUN chmod +x /usr/local/bin/php-classes.phar

ENTRYPOINT ["/generate-repo/bin/docker-entrypoint.sh"]
