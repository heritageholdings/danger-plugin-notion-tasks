npm publish --access public && \
npm config set @heritageholdings:registry https://npm.pkg.github.com --location project && \
npm publish && \
rm .npmrc