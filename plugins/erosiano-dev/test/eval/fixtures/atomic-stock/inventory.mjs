// Deliberately broken evaluation input.
export function createInventory(initial) {
    let stock = initial;
    return {
        remaining: () => stock,
        async reserve(quantity) {
            if (stock < quantity) return false;
            await Promise.resolve();
            stock -= quantity;
            return true;
        },
    };
}
