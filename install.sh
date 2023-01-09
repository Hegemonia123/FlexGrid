#!/bin/bash

if [[ `kpackagetool5 -l | grep "flexGrid"` ]]; then
    echo "Updating..."
    kpackagetool5 --type=KWin/Script -u .
    kwriteconfig5 --file kwinrc --group Plugins --key flexGridEnabled false
    qdbus org.kde.KWin /KWin reconfigure
    sleep 1;
    kwriteconfig5 --file kwinrc --group Plugins --key flexGridEnabled true
    qdbus org.kde.KWin /KWin reconfigure
else
    echo "Installing..."
    kpackagetool5 --type=KWin/Script -i .
fi