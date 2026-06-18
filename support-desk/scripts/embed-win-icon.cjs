'use strict';

const path = require('path');
const rcedit = require('rcedit');

exports.default = async function embedWinIcon(context) {
    if (context.electronPlatformName !== 'win32') return;

    const appInfo = context.packager.appInfo;
    const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
    const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');

    await rcedit(exePath, {
        icon: iconPath,
        'version-string': {
            FileDescription: appInfo.description || appInfo.productName,
            ProductName: appInfo.productName,
            LegalCopyright: appInfo.copyright || '',
            InternalName: path.basename(exePath, '.exe'),
            OriginalFilename: ''
        },
        'file-version': appInfo.shortVersion || appInfo.buildVersion,
        'product-version': appInfo.shortVersionWindows || appInfo.buildVersion
    });
};
