'use strict';

const { listEquipment } = require('./posEquipment');
const {
    loadStoreNetworkSettings,
    equipmentNeedsNetworkIp,
    normalizeMac,
    getStandardStoreNetworkTemplate,
    suggestedStandardIp
} = require('./posStoreNetwork');

const STEP_DEFS = Object.freeze([
    {
        id: 'network_settings',
        title: 'Set up network settings',
        summary: 'Load the recommended router address and network range, then save them here.',
        canSkip: false
    },
    {
        id: 'add_equipment',
        title: 'Add your store equipment',
        summary: 'List each register, card reader, printer, and other networked device.',
        canSkip: false
    },
    {
        id: 'enter_macs',
        title: 'Enter hardware addresses on each device',
        summary: 'Copy the MAC address from each device sticker into its equipment record.',
        canSkip: true
    },
    {
        id: 'configure_router',
        title: 'Set fixed addresses on the router',
        summary: 'In the router settings, reserve each device address from the plan below.',
        canSkip: true
    },
    {
        id: 'paste_and_sync',
        title: 'Paste from the router and sync',
        summary: 'Copy the router device list here so addresses update on each equipment row.',
        canSkip: false
    },
    {
        id: 'backup_test',
        title: 'Test backup internet (optional)',
        summary: 'Run a sale on normal internet, unplug the modem, then run a sale on backup.',
        canSkip: true
    }
]);

function planLoaded(settings, template) {
    const gw = String(settings?.gatewayIp || '').trim();
    const subnet = String(settings?.subnetCidr || '').trim();
    return gw === template.gatewayIp && subnet === template.subnetCidr;
}

function settingsSaved(settings) {
    return Boolean(String(settings?.gatewayIp || '').trim() && String(settings?.subnetCidr || '').trim());
}

function summarizeNetworkEquipment(row) {
    return {
        id: row.id,
        label: row.label,
        equipmentType: row.equipmentType,
        equipmentTypeLabel: row.equipmentTypeLabel,
        macAddress: normalizeMac(row.macAddress) || '',
        networkAddress: row.config?.address || '',
        suggestedAddress: suggestedStandardIp(row.equipmentType, 0) || ''
    };
}

async function buildNetworkSetupAssistant(pool, clientState = {}) {
    const skipped = new Set(Array.isArray(clientState.skipped) ? clientState.skipped : []);
    const routerMarkedDone = Boolean(clientState.routerMarkedDone);

    const [settings, equipment, template] = await Promise.all([
        loadStoreNetworkSettings(pool),
        listEquipment(pool, { includeInactive: false }),
        Promise.resolve(getStandardStoreNetworkTemplate())
    ]);

    const networkEquipment = equipment.filter((row) => equipmentNeedsNetworkIp(row));
    const missingMac = networkEquipment.filter((row) => !normalizeMac(row.macAddress));
    const missingAddress = networkEquipment.filter((row) => !String(row.config?.address || '').trim());

    const stepStatus = {
        network_settings: planLoaded(settings, template) && settingsSaved(settings),
        add_equipment: equipment.length > 0,
        enter_macs: networkEquipment.length === 0 || missingMac.length === 0,
        configure_router: routerMarkedDone || skipped.has('configure_router'),
        paste_and_sync: networkEquipment.length === 0 || missingAddress.length === 0,
        backup_test: Boolean(clientState.backupTestDone) || skipped.has('backup_test')
    };

    const steps = STEP_DEFS.map((def) => {
        const complete = Boolean(stepStatus[def.id]);
        const skippedStep = skipped.has(def.id);
        let status = 'pending';
        if (skippedStep && !complete) status = 'skipped';
        else if (complete) status = 'complete';

        const detail = buildStepDetail(def.id, {
            settings,
            template,
            equipment,
            networkEquipment,
            missingMac,
            missingAddress,
            skippedStep,
            routerMarkedDone
        });

        return {
            id: def.id,
            title: def.title,
            summary: def.summary,
            canSkip: def.canSkip,
            status,
            complete,
            skipped: skippedStep,
            ...detail
        };
    });

    let currentStepId = null;
    for (const step of steps) {
        if (step.status === 'complete' || step.status === 'skipped') continue;
        currentStepId = step.id;
        break;
    }
    if (!currentStepId && steps.some((s) => s.status === 'complete')) {
        currentStepId = steps.find((s) => s.status === 'complete')?.id || steps[0].id;
    }

    const completedCount = steps.filter((s) => s.status === 'complete').length;
    const allDone = steps.every((s) => s.status === 'complete' || s.status === 'skipped');

    const assistant = {
        currentStepId,
        completedCount,
        totalSteps: steps.length,
        allDone,
        steps,
        settings,
        standardTemplate: template,
        counts: {
            equipment: equipment.length,
            networkEquipment: networkEquipment.length,
            missingMac: missingMac.length,
            missingAddress: missingAddress.length
        },
        missingMacEquipment: missingMac.map(summarizeNetworkEquipment),
        missingAddressEquipment: missingAddress.map(summarizeNetworkEquipment),
        networkEquipment: networkEquipment.map(summarizeNetworkEquipment)
    };
    assistant.statusReport = buildSetupStatusReport(assistant, {
        routerMarkedDone,
        skipped: [...skipped],
        backupTestDone: Boolean(clientState.backupTestDone)
    });
    return assistant;
}

function buildSetupStatusReport(snapshot, clientState = {}) {
    const steps = snapshot?.steps || [];
    const settings = snapshot?.settings || {};
    const template = snapshot?.standardTemplate || {};
    const skipped = new Set(Array.isArray(clientState.skipped) ? clientState.skipped : []);

    const completedSteps = steps.filter((s) => s.status === 'complete');
    const pendingSteps = steps.filter((s) => s.status === 'pending');
    const nextStep = steps.find((s) => s.id === snapshot.currentStepId) || pendingSteps[0] || null;

    const completedItems = completedSteps.map((s) => s.title);

    const missingItems = [];

    const networkOk =
        settings.gatewayIp === template.gatewayIp &&
        settings.subnetCidr === template.subnetCidr &&
        Boolean(settings.gatewayIp) &&
        Boolean(settings.subnetCidr);
    if (!networkOk) {
        if (!settings.gatewayIp || !settings.subnetCidr) {
            missingItems.push({
                id: 'network_not_saved',
                label: 'Network settings are not saved yet',
                detail: 'Load the recommended router address (10.224.16.1) and network range, then save.',
                stepId: 'network_settings',
                actionId: 'save_settings'
            });
        } else {
            missingItems.push({
                id: 'network_not_recommended',
                label: 'Network settings do not match the recommended plan',
                detail: `Currently ${settings.gatewayIp || '—'} / ${settings.subnetCidr || '—'}. Recommended: ${template.gatewayIp} / ${template.subnetCidr}.`,
                stepId: 'network_settings',
                actionId: 'load_plan'
            });
        }
    }

    if ((snapshot.counts?.equipment || 0) === 0) {
        missingItems.push({
            id: 'no_equipment',
            label: 'No equipment added yet',
            detail: 'Add your register, card reader, printer, and other devices.',
            stepId: 'add_equipment',
            actionId: 'add_equipment'
        });
    }

    for (const eq of snapshot.missingMacEquipment || []) {
        missingItems.push({
            id: `mac_${eq.id}`,
            label: `Hardware address (MAC) missing on ${eq.label}`,
            detail: `${eq.equipmentTypeLabel} — copy the address from the device sticker.`,
            stepId: 'enter_macs',
            actionId: 'edit_next_mac',
            equipmentId: eq.id
        });
    }

    const routerDone = Boolean(clientState.routerMarkedDone) || skipped.has('configure_router');
    const needsRouter =
        (snapshot.counts?.networkEquipment || 0) > 0 &&
        !routerDone &&
        pendingSteps.some((s) => s.id === 'configure_router');
    if (needsRouter) {
        missingItems.push({
            id: 'router_reservations',
            label: 'Fixed addresses not set on the router yet',
            detail: 'Reserve each device address on the router to match the plan below.',
            stepId: 'configure_router',
            actionId: 'show_ip_plan'
        });
    }

    for (const eq of snapshot.missingAddressEquipment || []) {
        missingItems.push({
            id: `ip_${eq.id}`,
            label: `Network address missing on ${eq.label}`,
            detail: eq.suggestedAddress
                ? `Suggested: ${eq.suggestedAddress} — paste from router and apply.`
                : 'Paste the router device list and sync addresses.',
            stepId: 'paste_and_sync',
            actionId: 'focus_paste',
            equipmentId: eq.id
        });
    }

    const backupPending =
        !snapshot.allDone &&
        !skipped.has('backup_test') &&
        !clientState.backupTestDone &&
        completedSteps.some((s) => s.id === 'paste_and_sync');
    if (backupPending && pendingSteps.some((s) => s.id === 'backup_test')) {
        missingItems.push({
            id: 'backup_test',
            label: 'Backup internet test not done (optional)',
            detail: 'Run a sale on normal internet, unplug the modem, then run a sale on backup.',
            stepId: 'backup_test',
            actionId: 'backup_done'
        });
    }

    const fingerprint = JSON.stringify({
        currentStepId: snapshot.currentStepId,
        allDone: snapshot.allDone,
        counts: snapshot.counts,
        missingIds: missingItems.map((m) => m.id),
        completedCount: completedSteps.length,
        gateway: settings.gatewayIp,
        subnet: settings.subnetCidr
    });

    let headline = 'Network setup is complete.';
    if (!snapshot.allDone) {
        if (missingItems.length === 1) headline = '1 thing still needs attention.';
        else if (missingItems.length > 1) headline = `${missingItems.length} things still need attention.`;
        else if (nextStep) headline = `Next up: ${nextStep.title}`;
        else headline = 'Continue network setup.';
    }

    const primaryMissing = missingItems.find((m) => m.stepId === nextStep?.id) || missingItems[0] || null;

    return {
        fingerprint,
        headline,
        allDone: Boolean(snapshot.allDone),
        nextStep: nextStep
            ? {
                  id: nextStep.id,
                  title: nextStep.title,
                  summary: nextStep.summary,
                  status: nextStep.status
              }
            : null,
        completedItems,
        missingItems,
        primaryMissing,
        equipmentOnFile: (snapshot.networkEquipment || []).map((eq) => ({
            label: eq.label,
            type: eq.equipmentTypeLabel,
            mac: eq.macAddress || null,
            address: eq.networkAddress || null,
            suggestedAddress: eq.suggestedAddress || null
        })),
        networkSettings: {
            saved: Boolean(settings.gatewayIp && settings.subnetCidr),
            gateway: settings.gatewayIp || '',
            subnet: settings.subnetCidr || '',
            matchesRecommended: networkOk,
            routerUrl: settings.routerUrl || ''
        }
    };
}

function buildStepDetail(stepId, ctx) {
    const { settings, template, equipment, missingMac, missingAddress, networkEquipment } = ctx;

    switch (stepId) {
        case 'network_settings':
            return {
                message: planLoaded(settings, template) && settingsSaved(settings)
                    ? 'Your network settings are saved with the recommended addresses.'
                    : 'First load the recommended addresses into the form below, then save. Add your router settings page link and Wi‑Fi notes if you have them.',
                actions: [
                    { id: 'load_plan', label: 'Load recommended addresses', primary: false },
                    { id: 'focus_settings', label: 'Go to network form', primary: false },
                    { id: 'save_settings', label: 'Save network settings now', primary: true }
                ],
                checks: [
                    { label: 'Router address is 10.224.16.1', done: settings.gatewayIp === template.gatewayIp },
                    { label: 'Network range is 10.224.16.0/24', done: settings.subnetCidr === template.subnetCidr },
                    { label: 'Settings saved', done: settingsSaved(settings) }
                ]
            };
        case 'add_equipment':
            return {
                message:
                    equipment.length > 0
                        ? `You have ${equipment.length} piece(s) of equipment on file.`
                        : 'Add at least one register (and printers or card readers if you use them).',
                actions: [
                    { id: 'scroll_equipment', label: 'Go to equipment list', primary: false },
                    { id: 'add_equipment', label: 'Add equipment', primary: true }
                ],
                checks: [{ label: 'At least one equipment record exists', done: equipment.length > 0 }]
            };
        case 'enter_macs':
            return {
                message:
                    missingMac.length === 0
                        ? networkEquipment.length === 0
                            ? 'No networked equipment needs a hardware address yet.'
                            : 'Every networked device has a hardware address on file.'
                        : `${missingMac.length} device(s) still need a hardware address (MAC) from the sticker.`,
                actions: [
                    ...(missingMac.length
                        ? [
                              {
                                  id: 'edit_next_mac',
                                  label: `Enter address for ${missingMac[0].label}`,
                                  primary: true,
                                  equipmentId: missingMac[0].id
                              }
                          ]
                        : []),
                    { id: 'scroll_equipment', label: 'View equipment list', primary: !missingMac.length }
                ],
                checks: networkEquipment.length
                    ? networkEquipment.map((row) => ({
                          label: `${row.label} — hardware address`,
                          done: Boolean(normalizeMac(row.macAddress)),
                          equipmentId: row.id
                      }))
                    : [{ label: 'Add networked equipment first', done: false }]
            };
        case 'configure_router':
            return {
                message:
                    'On the router, give each POS device a fixed address that matches the table below. This is done in the router admin page — not in this screen.',
                actions: [
                    { id: 'show_ip_plan', label: 'Show address table', primary: false },
                    { id: 'router_done', label: "I've set this up on the router", primary: true }
                ],
                checks: [
                    { label: 'Fixed addresses reserved on the router', done: ctx.routerMarkedDone || ctx.skippedStep }
                ]
            };
        case 'paste_and_sync':
            return {
                message:
                    missingAddress.length === 0 && networkEquipment.length > 0
                        ? 'Every networked device has an address synced from the router.'
                        : 'Paste the router connected-device list, then match and apply addresses to equipment.',
                actions: [
                    { id: 'focus_paste', label: 'Go to paste box', primary: false },
                    { id: 'parse_list', label: 'Parse and match', primary: false },
                    { id: 'apply_all', label: 'Apply all matches', primary: true }
                ],
                checks: networkEquipment.length
                    ? networkEquipment.map((row) => ({
                          label: `${row.label} — network address`,
                          done: Boolean(String(row.config?.address || '').trim()),
                          equipmentId: row.id
                      }))
                    : [{ label: 'Add equipment first', done: false }]
            };
        case 'backup_test':
            return {
                message:
                    'If your router has cellular backup: run a test sale on normal internet, unplug the modem cable, and run another sale.',
                actions: [{ id: 'backup_done', label: 'Backup test passed', primary: true }],
                checks: [{ label: 'Backup internet tested (optional)', done: ctx.skippedStep }]
            };
        default:
            return { message: '', actions: [], checks: [] };
    }
}

function answerSetupQuestion(question, snapshot) {
    const q = String(question || '')
        .toLowerCase()
        .trim();
    if (!q) {
        return 'Ask something like “What address should my receipt printer use?” or “Why didn’t my paste match?”';
    }

    if (/what is (a )?mac|hardware address/.test(q)) {
        return 'The hardware address (MAC) is a code on a sticker on the device — usually looks like AA:BB:CC:DD:EE:FF. The router uses it to always give that device the same network address.';
    }
    if (/what is (a )?gateway|router address/.test(q)) {
        return `The router address is the door every device uses to reach the internet. For this store we recommend ${snapshot.standardTemplate?.gatewayIp || '10.224.16.1'}.`;
    }
    if (/why.*(no|not).*match|didn.?t match|parse/.test(q)) {
        if (snapshot.counts?.missingMac > 0) {
            const names = (snapshot.missingMacEquipment || []).map((e) => e.label).join(', ');
            return `Matching uses the hardware address. These devices are still missing it: ${names}. Edit each one and add the MAC from the sticker, then parse again.`;
        }
        return 'Make sure each line in your paste has a device name, IP address, and hardware address. The hardware address on the paste must match what you entered on the equipment record.';
    }
    if (/register|printer|terminal|card reader/.test(q) && /address|ip/.test(q)) {
        const plan = snapshot.standardTemplate?.ipPlan || [];
        const roleMap = [
            { re: /register/, type: 'register' },
            { re: /printer|receipt/, type: 'receipt_printer' },
            { re: /terminal|card|a3700/, type: 'card_terminal' },
            { re: /display/, type: 'customer_display' }
        ];
        for (const { re, type } of roleMap) {
            if (re.test(q)) {
                const row = plan.find((r) => r.equipmentType === type && r.station === 1);
                if (row) return `For register station 1, the recommended address for the ${row.role.toLowerCase()} is ${row.ip}. Station 2 uses .32–.38, station 3 uses .48–.54.`;
            }
        }
        const first = plan[0];
        return first
            ? `See the address table in the setup steps. Example: ${first.role} at station 1 uses ${first.ip}.`
            : 'Open the address table in step 5 to see recommended addresses per device.';
    }
    if (/skip|stuck|help|what.*next/.test(q)) {
        const step = (snapshot.steps || []).find((s) => s.id === snapshot.currentStepId);
        return step
            ? `You are on: ${step.title}. ${step.message}`
            : 'Follow the setup assistant steps from top to bottom. You can skip optional steps if needed.';
    }
    if (/wifi|wi-fi|password/.test(q)) {
        return 'Use a store-only Wi‑Fi network for registers and card readers — not guest Wi‑Fi. Write the Wi‑Fi name and password in Network notes so your installer can find them later.';
    }

    const step = (snapshot.steps || []).find((s) => s.id === snapshot.currentStepId);
    if (step) {
        return `Right now: ${step.title}. ${step.message} You can also use the action buttons on that step.`;
    }
    return 'Use the step buttons to load addresses, save settings, and sync from your router. Ask about MAC addresses, recommended IPs, or why a paste did not match.';
}

module.exports = {
    STEP_DEFS,
    buildNetworkSetupAssistant,
    buildSetupStatusReport,
    answerSetupQuestion
};
