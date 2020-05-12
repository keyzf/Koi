/**
 * A pond constellation consisting of a large pond, a small pond, and space for a river between
 * @param {Number} width The scene width in meters
 * @param {Number} height The scene height in meters
 * @constructor
 */
const Constellation = function(width, height) {
    this.width = width;
    this.height = height;
    this.big = null;
    this.small = null;
    this.river = null;
    this.spawnPoint = null;
    this.spawnDirection = null;

    this.fit();
};

Constellation.prototype.FACTOR_PADDING = .1;
Constellation.prototype.FACTOR_SMALL = .7;
Constellation.prototype.FACTOR_RIVER = .6;
Constellation.prototype.FISH_PER_AREA = 1;

/**
 * Update the atlas, write all fish textures again
 * @param {Atlas} atlas The atlas
 */
Constellation.prototype.updateAtlas = function(atlas) {
    this.big.updateAtlas(atlas);
    this.small.updateAtlas(atlas);
    this.river.updateAtlas(atlas);
};

/**
 * Resize the constellation
 * @param {Number} width The scene width
 * @param {Number} height The scene height
 * @param {Atlas} atlas The texture atlas
 */
Constellation.prototype.resize = function(width, height, atlas) {
    this.width = width;
    this.height = height;

    this.fit(atlas);
};

/**
 * Get the total number of fish this constellation supports
 * @returns {Number} The total fish capacity
 */
Constellation.prototype.getCapacity = function() {
    return Math.ceil(this.FISH_PER_AREA * Math.PI * (
        this.big.constraint.radius * this.big.constraint.radius +
        this.small.constraint.radius * this.small.constraint.radius));
};

/**
 * Get the number of fish existing in the constellation
 * @returns {Number}
 */
Constellation.prototype.getFishCount = function() {
    return this.big.fishes.length + this.small.fishes.length + this.river.fishes.length;
};

/**
 * Calculate the radius of the big pond which makes all elements fit optimally
 * @param {Number} width The scene width
 * @param {Number} height The scene height
 */
Constellation.prototype.getBigPondRadius = function(width, height) {
    const p1 = this.FACTOR_SMALL + 1;
    const a = (this.FACTOR_RIVER + p1) * (this.FACTOR_RIVER + p1) - 2 * p1 * p1;
    const b = (p1 + p1) * (height + width);
    const c = height * height + width * width;

    return (Math.sqrt(b * b + 4 * a * c) - b) / (a + a);
};

/**
 * Calculate the constellation layout
 * @param {Atlas} [atlas] The texture atlas, required when fish exist in the constellation
 */
Constellation.prototype.fit = function(atlas = null) {
    const radiusBigMax = Math.min(this.width, this.height) * .5;
    const radiusBig = Math.min(this.getBigPondRadius(this.width, this.height), radiusBigMax);
    const radiusSmall = this.FACTOR_SMALL * radiusBig;
    const centerBig = new Vector2(radiusBig, radiusBig);
    const centerSmall = new Vector2(this.width - radiusSmall, this.height - radiusSmall);
    const riverWidth = centerSmall.copy().subtract(centerBig).length() - radiusBig - radiusSmall;
    const riverTurn = Math.atan((centerSmall.y - centerBig.y) / (centerSmall.x - centerBig.x));

    const fullTurn = radiusBig !== radiusBigMax;
    const constraintBig = new ConstraintCircle(
        centerBig,
        radiusBig * (1 - this.FACTOR_PADDING));
    const constraintSmall = new ConstraintCircle(
        centerSmall,
        radiusSmall - radiusBig * this.FACTOR_PADDING);
    let constraintRiver;

    if (this.width > this.height) {
        constraintRiver = new ConstraintArcPath(
            [
                new ConstraintArcPath.Arc(
                    centerBig,
                    radiusBig + riverWidth * .5,
                    riverTurn,
                    fullTurn ? Math.PI : Math.PI * .5),
                new ConstraintArcPath.Arc(
                    centerSmall,
                    radiusSmall + riverWidth * .5,
                    Math.PI + riverTurn,
                    Math.PI * 2)
            ],
            radiusBig * this.FACTOR_RIVER);

        if (fullTurn) {
            this.spawnPoint = new Vector2(riverWidth * -.5, radiusBig + .000001);
            this.spawnDirection = new Vector2(0, 1);
        }
        else {
            this.spawnPoint = new Vector2(radiusBig + .000001, this.height + riverWidth * .5);
            this.spawnDirection = new Vector2(1, 0);
        }
    }
    else {
        constraintRiver = new ConstraintArcPath(
            [
                new ConstraintArcPath.Arc(
                    centerBig,
                    radiusBig + riverWidth * .5,
                    fullTurn ? Math.PI * 1.5 : 0,
                    fullTurn ? Math.PI * 2 + riverTurn : riverTurn),
                new ConstraintArcPath.Arc(
                    centerSmall,
                    radiusSmall + riverWidth * .5,
                    Math.PI * .5,
                    Math.PI + riverTurn)
            ],
            radiusBig * this.FACTOR_RIVER);

        if (fullTurn) {
            this.spawnPoint = new Vector2(radiusBig + .000001, riverWidth * -.5);
            this.spawnDirection = new Vector2(1, 0);
        }
        else {
            this.spawnPoint = new Vector2(this.width + riverWidth * .5, radiusBig + .000001);
            this.spawnDirection = new Vector2(0, 1);
        }
    }

    if (this.big) {
        this.big.replaceConstraint(constraintBig, atlas);
        this.small.replaceConstraint(constraintSmall, atlas);
        this.river.replaceConstraint(constraintRiver, atlas);
    }
    else {
        this.big = new Pond(constraintBig);
        this.small = new Pond(constraintSmall);
        this.river = new Pond(constraintRiver);
    }
};

/**
 * Pick up a fish at given coordinates
 * @param {Number} x The X position
 * @param {Number} y The Y position
 * @returns {Fish} The fish at the given position, or null if no fish exists there
 */
Constellation.prototype.pick = function(x, y) {
    return this.big.pick(x, y) || this.small.pick(x, y) || this.river.pick(x, y) || null;
};

/**
 * Drop a fish in the nearest suitable location of this constellation
 * @param {Fish} fish A fish
 */
Constellation.prototype.drop = function(fish) {
    if (this.big.constraint.contains(fish.position.x, fish.position.y))
        this.big.addFish(fish);
    else if (this.small.constraint.contains(fish.position.x, fish.position.y))
        this.small.addFish(fish);
    else if (this.river.constraint.contains(fish.position.x, fish.position.y))
        this.river.addFish(fish);
    else {
        const nearestBig = fish.position.copy();
        const nearestSmall = fish.position.copy();
        const nearestRiver = fish.position.copy();

        this.big.constraint.constrain(nearestBig);
        this.small.constraint.constrain(nearestSmall);

        let nearestDist = fish.position.copy().subtract(nearestBig).length();
        let nearestPosition = nearestBig;
        let nearest = this.big;

        const smallDist = fish.position.copy().subtract(nearestSmall).length();

        if (smallDist < nearestDist) {
            nearestDist = smallDist;
            nearestPosition = nearestSmall;
            nearest = this.small;
        }

        if (this.river.constraint.constrain(nearestRiver)) {
            if (fish.position.copy().subtract(nearestRiver).length() < nearestDist) {
                nearestPosition = nearestRiver;
                nearest = this.river;
            }
        }

        fish.drop(nearestPosition);
        nearest.addFish(fish);
    }
};

/**
 * Update the constellation
 * @param {Atlas} atlas The pattern atlas
 * @param {Random} random A randomizer
 */
Constellation.prototype.update = function(atlas, random) {
    this.small.update(atlas, random);
    this.big.update(atlas, random);
    this.river.update(atlas, random);
};

/**
 * Render the constellation
 * @param {Primitives} primitives The primitives renderer
 * @param {Number} time The amount of time since the last update
 */
Constellation.prototype.render = function(primitives, time) {
    // TODO: Track last update time per pond
    this.small.render(primitives, time);
    this.big.render(primitives, time);
    this.river.render(primitives, time);
};