export const ROOM_NAMES = ["Grote zaal", "Spiegelzaal", "Garderobe", "Studio 1", "Studio 2"];
export const ROOM_SLUGS = ["grote-zaal", "spiegelzaal", "garderobe", "studio-1", "studio-2"];

export const slugToRoomIndex = (slug) => {
    const index = ROOM_SLUGS.indexOf(slug);
    return index === -1 ? null : index;
}

export const displayRooms = (rooms) => {
    if (rooms?.length === ROOM_NAMES.length) {
        return "Hele gebouw";
    }
    if (rooms?.length > 0) {
        return rooms.map(i => ROOM_NAMES[i]).join(' + ');
    }
    return null;
}

export const showVenue = (itemLocation, itemRooms, fullLocation) => {
    if (itemLocation) {
        return fullLocation ? [itemLocation.name,itemLocation.address].join(", ") : itemLocation?.name;
    }

    if (itemRooms){
        return displayRooms(itemRooms);
    }

    return "geen locatie";
}

export const EVENT_STATUS = ["OPTION", "PENDING_APPROVAL", "PUBLIC", "PRIVATE"];

export const EVENT_STATUS_COLOR = {
    "OPTION": 'grey',
    "PENDING_APPROVAL": 'var(--wp-components-color-accent, var(--wp-admin-theme-color, #3858e9))',
    "PUBLIC": 'green',
    "PRIVATE": 'purple',
}

export const ROOM_COLORS = {
    "grote-zaal": "#2d7d8e",
    "spiegelzaal": "#5a8e2b",
    "garderobe": "#845d95",
    "studio-1": "#936a50",
    "studio-2": "#455787",
}
