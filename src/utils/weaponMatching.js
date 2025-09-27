// Fuzzy weapon matching function
function fuzzyWeaponMatch(weapon1, weapon2) {
    // Normalize weapon names (remove spaces, hyphens, convert to lowercase)
    const normalize = (str) => str.toLowerCase().replace(/[\s\-_]/g, '');
    
    const norm1 = normalize(weapon1);
    const norm2 = normalize(weapon2);
    
    // Check if one contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
        return true;
    }
    
    // Check for common weapon variations
    const weaponVariations = {
        'queda': ['quedasanta', 'queda-santa', 'queda santa'],
        'fire': ['firestaff', 'fire-staff', 'fire staff'],
        'frost': ['froststaff', 'frost-staff', 'frost staff'],
        'nature': ['naturestaff', 'nature-staff', 'nature staff'],
        'holy': ['holystaff', 'holy-staff', 'holy staff'],
        'cursed': ['cursedstaff', 'cursed-staff', 'cursed staff'],
        'bow': ['warbow', 'war-bow', 'war bow'],
        'crossbow': ['crossbow', 'cross-bow', 'cross bow'],
        'sword': ['broadsword', 'broad-sword', 'broad sword'],
        'spear': ['spear', 'heron spear', 'heron-spear'],
        'axe': ['battleaxe', 'battle-axe', 'battle axe'],
        'hammer': ['great hammer', 'great-hammer', 'greathammer'],
        'dagger': ['dagger', 'bloodletter', 'blood-letter'],
        'mace': ['mace', 'heavy mace', 'heavy-mace']
    };
    
    // Check variations
    for (const [base, variations] of Object.entries(weaponVariations)) {
        if (variations.includes(norm1) && variations.includes(norm2)) {
            return true;
        }
        if (norm1.includes(base) && norm2.includes(base)) {
            return true;
        }
    }
    
    return false;
}

module.exports = { fuzzyWeaponMatch };
