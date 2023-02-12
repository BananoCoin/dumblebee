## to update outdated deps

    npm install package@latest;

## to publish a new version

    npm run preflight;

    git commit -a -m 'updating dependencies';
    npm version patch;
    git pull;
    git push;
    git push --tags;

### update version in package-lock.json and run unit tests.
