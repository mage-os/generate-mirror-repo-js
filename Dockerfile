
FROM composer/satis AS build

RUN apk add nodejs npm jq

ENV NODE_ENV=production

ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/

ENV IPE_GD_WITHOUTAVIF=1
RUN chmod +x /usr/local/bin/install-php-extensions && \
    install-php-extensions bcmath gd intl pdo_mysql soap xsl

WORKDIR /generate-repo
COPY . /generate-repo
RUN cd /generate-repo && npm install

ENV XDG_CONFIG_HOME=/generate-repo
RUN mkdir /generate-repo/git && \
    chmod 0777 /generate-repo/git && \
    touch /generate-repo/git/config && \
    chmod 0666 /generate-repo/git/config

RUN mkdir /generate-repo/repositories && \
    chmod 0777 /generate-repo/repositories && \
    chmod -R 0777 /satis/vendor/composer && \
    chmod -R 0777 /satis/views

RUN curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar -o /usr/local/bin/php-classes.phar && \
    chmod +x /usr/local/bin/php-classes.phar

ENTRYPOINT ["/generate-repo/bin/docker-entrypoint.sh"]
