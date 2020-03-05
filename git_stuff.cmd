#git.cmd

git config --global user.name "joshbooker"
#git config --global user.email a@a.com

git config --list

git init                                                           // start tracking current directory
git add -A                                                         // add all files in current directory to staging area, making them available for commit
git commit -m "initial commit"                                     // commit your changes
git remote add origin https://github.com/joshbooker/DMach.git   // add remote repository URL which contains the required details
git pull origin master                                             // always pull from remote before pushing
git push -u origin master                                          // publish changes to your remote repository


# Install az cli from here
https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest

az login

# Replace the following URL with a public GitHub repo URL
gitrepo=https://github.com/joshbooker/azTest.git
azTestApp=azTestApp

# Create a resource group.
az group create --location northcentralus --name azTestGroup1

# Create an App Service plan in `FREE` tier.
az appservice plan create --name azTestPlan1 --resource-group azTestGroup1 --sku FREE

# Create a web app.
az webapp create --name azTestApp101 --resource-group azTestGroup1 --plan azTestPlan1

# NOW GO TO PORTAL AND ADD .Net Core 3.1 Extensions - not sure how to do that w cli

# DEPLOY
# EITHER
    # 1 Deploy code from a public GitHub repository. - this doesn't work on Azure due to missing .Net Core 3.1 SDK
    az webapp deployment source config --name azTestApp101 --resource-group azTestGroup1 --repo-url https://github.com/joshbooker/azTest.git --branch master --manual-integration
# OR
    # 2 Deploy code from a deploy.zip - this works as long as .net core 3.1 extensions are enabled in portal
    curl -X POST -u azTestApp101\$azTestApp101 --data-binary @"deploy.zip" https://azTestApp101.scm.azurewebsites.net/api/zipdeploy
    #az webapp deployment source config-zip --resource-group azTestGroup1 --name azTestApp101 --src deploy.zip

# Copy the result of the following command into a browser to see the web app.
echo http://azTestApp101.azurewebsites.net