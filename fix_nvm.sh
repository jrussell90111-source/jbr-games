# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify it beats any older node on PATH
which node
node -v

# Reinstall deps and run
cd ~/games/poker/videopoker-react
rm -rf node_modules package-lock.json
npm install
npm run dev
