// Audio Context for ephemeral ambient sounds
let audioContext;
let gainNode;
let isMuted = true; // Start muted by default

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 0.15; // Subtle volume
    }
}

function toggleSound() {
    isMuted = !isMuted;
    const button = document.getElementById('sound-toggle');
    if (button) {
        button.classList.toggle('active', !isMuted);
        button.setAttribute('aria-label', isMuted ? 'Unmute sound (Shift+M)' : 'Mute sound (Shift+M)');
        button.title = isMuted ? 'Unmute (Shift+M)' : 'Mute (Shift+M)';
    }
    // Initialize audio on first unmute (requires user interaction)
    if (!isMuted && !audioContext) {
        initAudio();
    }
}

// Play a soft, ambient tone
function playAmbientTone(frequency, duration, fadeOut = true) {
    if (isMuted) return; // Don't play if muted

    if (!audioContext || audioContext.state === 'suspended') {
        initAudio();
    }

    const oscillator = audioContext.createOscillator();
    const toneGain = audioContext.createGain();

    oscillator.connect(toneGain);
    toneGain.connect(gainNode);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    const now = audioContext.currentTime;
    const startTime = Math.max(0, now);
    const fadeInTime = Math.max(0, startTime + 0.1);
    const fadeOutStart = Math.max(0, startTime + Math.max(0, duration - 0.2));
    const endTime = Math.max(0, startTime + duration);

    toneGain.gain.setValueAtTime(0, startTime);
    toneGain.gain.linearRampToValueAtTime(0.3, fadeInTime);

    if (fadeOut) {
        toneGain.gain.linearRampToValueAtTime(0.3, fadeOutStart);
        toneGain.gain.linearRampToValueAtTime(0, endTime);
    }

    oscillator.start(startTime);
    oscillator.stop(endTime);
}

// Short tick when moving selected time (A/D). Pitch varies by zoom level (1 = low, 9 = high).
function playTickSound(zoomLevel) {
    if (isMuted) return;
    if (!audioContext || audioContext.state === 'suspended') {
        initAudio();
    }
    var level = Math.max(1, Math.min(9, Number(zoomLevel) || 5));
    var frequency = 180 + (level - 1) * 95;
    var oscillator = audioContext.createOscillator();
    var tickGain = audioContext.createGain();
    oscillator.connect(tickGain);
    tickGain.connect(gainNode);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    var now = audioContext.currentTime;
    var startTime = Math.max(0, now);
    var endTime = startTime + 0.06;
    tickGain.gain.setValueAtTime(0.25, startTime);
    tickGain.gain.linearRampToValueAtTime(0, endTime);
    oscillator.start(startTime);
    oscillator.stop(endTime);
}

// Subtle whoosh/transition sound
function playTransitionSound() {
    if (isMuted) return; // Don't play if muted

    if (!audioContext || audioContext.state === 'suspended') {
        initAudio();
    }

    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const transitionGain = audioContext.createGain();

    oscillator.connect(filter);
    filter.connect(transitionGain);
    transitionGain.connect(gainNode);

    oscillator.frequency.value = 150;
    oscillator.type = 'sine';
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    const now = audioContext.currentTime;
    const startTime = Math.max(0, now);
    const peakTime = Math.max(0, startTime + 0.05);
    const endTime = Math.max(0, startTime + 0.3);

    transitionGain.gain.setValueAtTime(0, startTime);
    transitionGain.gain.linearRampToValueAtTime(0.2, peakTime);
    transitionGain.gain.linearRampToValueAtTime(0, endTime);

    filter.frequency.linearRampToValueAtTime(200, endTime);

    oscillator.start(startTime);
    oscillator.stop(endTime);
}

// Soft click for button interactions
function playClickSound() {
    if (isMuted) return; // Don't play if muted

    if (!audioContext || audioContext.state === 'suspended') {
        initAudio();
    }
    playAmbientTone(880, 0.08, true);
}

// Form submission handler - plays sound, then allows FormSubmit to handle
document.getElementById('registration-form').addEventListener('submit', function(e) {
    playAmbientTone(660, 0.5, true); // Confirmation tone
    // Form will be submitted to FormSubmit.co
});

// Add click sounds to buttons
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.zoom-option').forEach(btn => {
        btn.addEventListener('click', playClickSound);
    });

    const exploreBtn = document.querySelector('.explore-btn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', playTransitionSound);
    }

    // Sound toggle button
    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', toggleSound);
    }
});
