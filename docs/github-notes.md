### to force only one version of dumblebee

    git pull;
    rm -rf .git;
    git init;
    find . -exec touch {} \;
    git add .;
    git commit -m "Initial commit";
    git remote add origin https://github.com/BananoCoin/dumblebee.git;
    git push -u --force origin master;
    git branch --set-upstream-to=origin/master master;
    git pull;git push;

## to force local version to match origin/master

    git fetch --all;
    git reset --hard origin/master;
