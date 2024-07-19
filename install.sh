#!/bin/bash

if [[ `kpackagetool6 -l --type=KWin/Script | grep "flexgrid"` ]]; then
    echo "Updating..."
    kpackagetool6 --type=KWin/Script -u .
    kwriteconfig6 --file kwinrc --group Plugins --key flexGridEnabled false
    qdbus org.kde.KWin /KWin reconfigure
    kwriteconfig6 --file kwinrc --group Plugins --key flexGridEnabled true
    qdbus org.kde.KWin /KWin reconfigure
else
    echo "Installing..."
    kpackagetool6 --type=KWin/Script -i .
fi
