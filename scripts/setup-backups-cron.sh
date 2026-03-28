#!/bin/bash
# Run daily at 3:00 AM Moscow time
(crontab -l 2>/dev/null; echo "0 3 * * * /root/Asset-Manager/scripts/backup-db.sh >> /var/log/db-backups.log 2>&1") | crontab -
echo "Backup cron installed. Check with: crontab -l"
