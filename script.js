document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('marimoCanvas');
    const ctx = canvas.getContext('2d');
    const infoPanel = document.getElementById('marimoInfoPanel');
    const debugInfo = document.getElementById('debugInfo');

    const GAME_SAVE_KEY = 'marimoLifeSaveData';
    const UPDATE_INTERVAL = 1000 * 5; // Check needs every 5 seconds
    const LONG_UPDATE_INTERVAL = 1000 * 60 * 5; // Check slower things every 5 minutes

    // Marimo Names
    const MARIMO_NAMES = ["Mossy", "Verdi", "Bubbles", "Rolly", "Puff", "Kelp", "Sprout", "Fern"];

    // --- Game State ---
    let marimos = []; // Array to hold all marimo objects
    let activeMarimoId = null;
    let lastUpdateTime = Date.now();
    let lastLongUpdateTime = Date.now();

    // --- Marimo Class ---
    class Marimo {
        constructor(id, name, birthTime = Date.now()) {
            this.id = id;
            this.name = name;
            this.birthTime = birthTime;
            this.x = canvas.width / 2;
            this.y = canvas.height - 50; // Start near bottom
            this.targetY = this.y; // For bobbing
            this.bobOffset = 0;
            this.bobSpeed = 0.02;
            this.size = 20; // Initial radius
            this.maxSize = 80;
            this.growthRate = 0.0000001; // pixels per millisecond of life

            // Needs (0-100)
            this.hunger = 80;
            this.cleanliness = 90; // Tank cleanliness
            this.happiness = 70;
            this.waterQuality = 80; // New need

            // Timestamps for events
            this.lastFedTime = Date.now();
            this.lastCleanedTime = Date.now(); // Tank cleaned
            this.lastInteractedTime = Date.now();
            this.lastWaterChangeTime = Date.now();
            this.lastPoopedTime = Date.now();

            this.poopCount = 0;
            this.poops = []; // {x, y} for each poop particle

            // Lifecycle (for future)
            this.age = 0; // in milliseconds, calculated from birthTime
            this.stage = 'baby'; // baby, juvenile, adult, elder
            this.partnerId = null;
            this.isPregnant = false;
            this.pregnancyProgress = 0; // 0-100
        }

        static fromPlainObject(obj) {
            const marimo = new Marimo(obj.id, obj.name, obj.birthTime);
            Object.assign(marimo, obj); // Copies all properties
            // Ensure nested objects like poops are also fine, or handle separately if they have methods
            return marimo;
        }

        update(elapsedTime, elapsedLongTime) {
            // Age
            this.age = Date.now() - this.birthTime;
            const ageInDays = this.age / (1000 * 60 * 60 * 24);

            // Growth
            if (this.size < this.maxSize) {
                this.size += this.growthRate * elapsedTime;
            }

            // Needs decay (per second rates converted to per elapsedTime)
            const perSecondDecayFactor = elapsedTime / 1000;
            this.hunger -= 0.05 * perSecondDecayFactor;         // Gets hungry slowly
            this.happiness -= 0.03 * perSecondDecayFactor;      // Loses happiness slowly
            this.waterQuality -= 0.015 * perSecondDecayFactor;   // Water gets dirty

            if (this.hunger < 0) this.hunger = 0;
            if (this.happiness < 0) this.happiness = 0;
            if (this.waterQuality < 0) this.waterQuality = 0;

            // Cleanliness affected by poop
            this.cleanliness = 100 - (this.poopCount * 20); // Each poop reduces cleanliness
            if (this.cleanliness < 0) this.cleanliness = 0;


            // Happiness modifiers
            if (this.hunger < 30) this.happiness -= 0.05 * perSecondDecayFactor;
            if (this.cleanliness < 40) this.happiness -= 0.05 * perSecondDecayFactor;
            if (this.waterQuality < 30) this.happiness -= 0.05 * perSecondDecayFactor;


            // Pooping (e.g., once every 8-24 real hours, more if overfed)
            const poopInterval = (12 + Math.random() * 12) * 60 * 60 * 1000; // 12-24 hours
            if (Date.now() - this.lastPoopedTime > poopInterval && this.poopCount < 5) {
                this.poop();
                this.lastPoopedTime = Date.now();
            }

            // Bobbing animation
            this.bobOffset += this.bobSpeed;
            this.y = this.targetY + Math.sin(this.bobOffset) * 3; // Bob up and down by 3px
        }

        feed() {
            this.hunger = Math.min(100, this.hunger + 40 + Math.random() * 20);
            this.happiness = Math.min(100, this.happiness + 5);
            this.lastFedTime = Date.now();
            // Overfeeding can lead to more poop or lower cleanliness faster (optional)
            if (this.hunger > 95 && Math.random() < 0.3) { // 30% chance to poop soon if overfed
                setTimeout(() => { if (this.poopCount < 5) this.poop(); }, 1000 * 60 * (5 + Math.random() * 10)); // Poop in 5-15 mins
            }
        }

        cleanTank() { // Clears poop
            this.poopCount = 0;
            this.poops = [];
            this.cleanliness = 100;
            this.happiness = Math.min(100, this.happiness + 10);
            this.lastCleanedTime = Date.now();
        }

        interact() {
            this.happiness = Math.min(100, this.happiness + 15 + Math.random() * 10);
            this.lastInteractedTime = Date.now();
            // Simple animation for interaction: quick bounce
            this.y -= 5;
            setTimeout(() => { if (this.y < this.targetY) this.y = this.targetY;}, 200);
        }

        changeWater() {
            this.waterQuality = 100;
            this.happiness = Math.min(100, this.happiness + 20);
            this.lastWaterChangeTime = Date.now();
        }

        poop() {
            if (this.poopCount >= 5) return; // Max 5 poops on screen
            this.poopCount++;
            const poopX = this.x + (Math.random() - 0.5) * this.size * 1.5; // Near marimo
            const poopY = canvas.height - 10 - Math.random() * 10; // On the bottom
            this.poops.push({
                x: Math.max(5, Math.min(canvas.width - 5, poopX)), // Keep in bounds
                y: poopY,
                size: 3 + Math.random() * 3
            });
        }

        draw() {
            // Draw Marimo Body (many small circles for texture)
            const numCircles = 30 + Math.floor(this.size / 2);
            const baseRadius = this.size;

            for (let i = 0; i < numCircles; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * baseRadius * 0.6; // Place smaller circles within main radius
                const offsetX = Math.cos(angle) * dist;
                const offsetY = Math.sin(angle) * dist;
                const circRadius = baseRadius * (0.15 + Math.random() * 0.15); // Vary size of small circles

                // Slightly varying green colors
                const r = 30 + Math.floor(Math.random() * 20);
                const g = 100 + Math.floor(Math.random() * 50);
                const b = 30 + Math.floor(Math.random() * 20);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;

                ctx.beginPath();
                ctx.arc(this.x + offsetX, this.y + offsetY, circRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Optional: a subtle highlight
            ctx.fillStyle = 'rgba(200, 255, 200, 0.1)';
            ctx.beginPath();
            ctx.arc(this.x - this.size * 0.2, this.y - this.size * 0.2, this.size * 0.8, 0, Math.PI * 2);
            ctx.fill();


            // Draw poops associated with this Marimo
            this.poops.forEach(p => {
                ctx.fillStyle = '#8B4513'; // Brown
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    // --- Drawing Functions ---
    function drawBackground() {
        // Water gradient is set in CSS. This is for dynamic elements.
        // Rocks at the bottom
        const rockColors = ['#AAAAAA', '#BBBBBB', '#999999', '#A0A0A0'];
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = rockColors[Math.floor(Math.random() * rockColors.length)];
            const rockSize = 20 + Math.random() * 30;
            const rockX = Math.random() * canvas.width;
            const rockY = canvas.height - rockSize / 2 - Math.random() * 10; // Slightly varied y
            
            ctx.beginPath();
            // Draw irregular rock shape
            ctx.moveTo(rockX - rockSize / 2, rockY + rockSize/3);
            ctx.quadraticCurveTo(rockX - rockSize/3, rockY - rockSize/2, rockX, rockY - rockSize/3);
            ctx.quadraticCurveTo(rockX + rockSize/3, rockY - rockSize/2, rockX + rockSize / 2, rockY + rockSize/3);
            ctx.quadraticCurveTo(rockX + rockSize/4, rockY + rockSize/2, rockX, rockY + rockSize/2);
            ctx.quadraticCurveTo(rockX - rockSize/4, rockY + rockSize/2, rockX - rockSize / 2, rockY + rockSize/3);
            ctx.closePath();
            ctx.fill();
        }
    }

    // --- UI Update ---
    function updateInfoPanel() {
        if (!activeMarimoId || marimos.length === 0) {
            infoPanel.innerHTML = "<p>No Marimo selected or exists.</p>";
            return;
        }
        const marimo = marimos.find(m => m.id === activeMarimoId);
        if (!marimo) return;

        const ageInDays = Math.floor(marimo.age / (1000 * 60 * 60 * 24));
        const ageInHours = Math.floor((marimo.age % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        infoPanel.innerHTML = `
            <h3><span class="marimo-name">${marimo.name}</span> (ID: ${marimo.id})</h3>
            <p>Age: ${ageInDays}d ${ageInHours}h</p>
            <p>Size: ${marimo.size.toFixed(1)}</p>
            <p>Hunger: <span class="stat-bar-container"><span class="stat-bar ${getStatBarClass(marimo.hunger)}" style="width: ${marimo.hunger}%;"></span></span> ${marimo.hunger.toFixed(0)}%</p>
            <p>Clean: <span class="stat-bar-container"><span class="stat-bar ${getStatBarClass(marimo.cleanliness)}" style="width: ${marimo.cleanliness}%;"></span></span> ${marimo.cleanliness.toFixed(0)}%</p>
            <p>Water: <span class="stat-bar-container"><span class="stat-bar ${getStatBarClass(marimo.waterQuality)}" style="width: ${marimo.waterQuality}%;"></span></span> ${marimo.waterQuality.toFixed(0)}%</p>
            <p>Happy: <span class="stat-bar-container"><span class="stat-bar ${getStatBarClass(marimo.happiness)}" style="width: ${marimo.happiness}%;"></span></span> ${marimo.happiness.toFixed(0)}%</p>
            <p>Poops: ${marimo.poopCount}</p>
        `;
         // Debug info for specific times
        debugInfo.innerHTML = `
            Last Fed: ${new Date(marimo.lastFedTime).toLocaleTimeString()}<br>
            Last Cleaned: ${new Date(marimo.lastCleanedTime).toLocaleTimeString()}<br>
            Last Water: ${new Date(marimo.lastWaterChangeTime).toLocaleTimeString()}<br>
            Last Pooped: ${new Date(marimo.lastPoopedTime).toLocaleTimeString()}
        `;
    }
    
    function getStatBarClass(value) {
        if (value < 30) return 'critical';
        if (value < 60) return 'low';
        return '';
    }


    // --- Game Loop & Logic ---
    function gameLoop() {
        const now = Date.now();
        const elapsedTime = now - lastUpdateTime; // Time since last quick update
        const elapsedLongTime = now - lastLongUpdateTime; // Time since last "slow" update

        if (elapsedTime >= UPDATE_INTERVAL) {
            marimos.forEach(marimo => marimo.update(elapsedTime, 0)); // Pass 0 for elapsedLongTime here
            lastUpdateTime = now;
            updateInfoPanel(); // Update UI less frequently for performance
            saveGame();
        }
        
        if (elapsedLongTime >= LONG_UPDATE_INTERVAL) {
            // For very slow processes, if any, could be handled here
            // For example, major life stage changes, partner events.
            // marimos.forEach(marimo => marimo.slowUpdate(elapsedLongTime));
            lastLongUpdateTime = now;
        }


        // Drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        marimos.forEach(marimo => marimo.draw());

        requestAnimationFrame(gameLoop);
    }

    // --- Save/Load ---
    function saveGame() {
        const saveData = {
            marimos: marimos, // Save the plain objects
            activeMarimoId: activeMarimoId,
            lastUpdateTime: lastUpdateTime,
            lastLongUpdateTime: lastLongUpdateTime
        };
        localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(saveData));
    }

    function loadGame() {
        const savedData = localStorage.getItem(GAME_SAVE_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            // Re-construct Marimo instances from plain objects
            marimos = parsedData.marimos.map(obj => Marimo.fromPlainObject(obj));
            activeMarimoId = parsedData.activeMarimoId;
            lastUpdateTime = parsedData.lastUpdateTime || Date.now(); // Handle if not saved before
            lastLongUpdateTime = parsedData.lastLongUpdateTime || Date.now();

            // Crucial: Apply missed updates since last save
            const timeSinceLastSave = Date.now() - lastUpdateTime;
            const longTimeSinceLastSave = Date.now() - lastLongUpdateTime;

            if (timeSinceLastSave > 0) {
                 marimos.forEach(marimo => marimo.update(timeSinceLastSave, 0));
            }
            // if (longTimeSinceLastSave > 0) { // If you have slowUpdate
            //      marimos.forEach(marimo => marimo.slowUpdate(longTimeSinceLastSave));
            // }
            console.log("Game loaded. Time since last save:", timeSinceLastSave/1000, "s");


        } else {
            // Create a new Marimo if no save data
            const newId = Date.now().toString();
            const randomName = MARIMO_NAMES[Math.floor(Math.random() * MARIMO_NAMES.length)];
            const newMarimo = new Marimo(newId, randomName);
            marimos.push(newMarimo);
            activeMarimoId = newId;
            lastUpdateTime = Date.now(); // Initialize update times
            lastLongUpdateTime = Date.now();
        }
        if (marimos.length > 0 && !activeMarimoId) {
            activeMarimoId = marimos[0].id; // Default to first marimo if none active
        }
    }

    // --- Event Handlers ---
    document.querySelectorAll('.controls-panel button[data-action]').forEach(button => {
        button.addEventListener('click', (e) => {
            if (!activeMarimoId || marimos.length === 0) return;
            const marimo = marimos.find(m => m.id === activeMarimoId);
            if (!marimo) return;

            const action = e.target.dataset.action;
            switch (action) {
                case 'feed': marimo.feed(); break;
                case 'clean': marimo.cleanTank(); break;
                case 'interact': marimo.interact(); break;
                case 'changeWater': marimo.changeWater(); break;
            }
            updateInfoPanel(); // Immediate UI update for responsiveness
            saveGame();
        });
    });
    
    document.getElementById('resetButton').addEventListener('click', () => {
        if (confirm("Are you sure you want to delete your Marimo and start over? This cannot be undone!")) {
            localStorage.removeItem(GAME_SAVE_KEY);
            marimos = []; // Clear current marimos
            activeMarimoId = null;
            loadGame(); // This will now create a new Marimo
            updateInfoPanel();
        }
    });


    // --- Initialization ---
    loadGame();
    updateInfoPanel();
    gameLoop(); // Start the main game loop

    // Initial save after load/creation
    saveGame();
});
