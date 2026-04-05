/**
 * Circaevum GL - Public API
 *
 * This is the main entry point for using Circaevum as a graphics library.
 * Similar to Mapbox GL JS API design.
 *
 * Usage:
 *   const gl = new CircaevumGL(containerElement, options);
 *   gl.addLayer('my-calendar', { color: '#ff0000' });
 *   gl.addEvents('my-calendar', events); // Events in RFC 5545 VEVENT format
 *
 * EventObjects (web): Each event is rendered as a scene object (mesh or line) with
 * userData.vevent, userData.layerId, userData.type === 'EventObject'. For API
 * consumption use getEventObjects(layerId). To push event data from an account-
 * managed React page use ingestEvents(layerId, events, { sessionId: '26Q1W01' }).
 *
 * Reference: spec/schemas/vevent-rfc5545.md
 *
 * Dependencies:
 *   - VEvent class from js/models/vevent.js (must be loaded before this file)
 *   - EventRenderer from js/renderers/event-renderer.js (for event visualization)
 */

// Import core modules (will be bundled or loaded separately)
// For now, we'll assume they're available globally or via module system
// VEvent must be available (loaded from js/models/vevent.js)

class CircaevumGL {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('Container element is required');
    }

    this.container = container;
    this.options = {
      zoomLevel: options.zoomLevel || 2,
      lightMode: options.lightMode || false,
      ...options
    };

    /** 'year' = show only events overlapping the selected calendar year; 'all' = no time scope filter */
    this.timelineEventFilter =
      options.timelineEventFilter === 'all' ? 'all' : 'year';

    // Internal state
    this.layers = new Map(); // layerId -> LayerConfig
    this.events = new Map(); // layerId -> Event[]
    this.eventLines = new Map(); // layerId -> Array<{ start, end, label?, color? }>
    this._eventLineColorIndex = 0; // cycle through palette when color not specified
    this.eventHandlers = new Map(); // eventType -> [callbacks]
    this.layerStylesByCategory = {}; // from wrapper options.layerStyles; category name -> { color, plotType, ... }
    
    // Core scene components (will be initialized)
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.sceneContentGroup = null;
    this.flattenableGroup = null; // Group that is scaled when flatten view is on (from main.js)
    
    // Initialize the scene
    this._initialize();
  }

  /**
   * Initialize the core scene
   * @private
   */
  _initialize() {
    // Wait for the main scene to be initialized by main.js
    // Don't interfere with existing initialization
    // Just reference the global scene objects when they're available
    this._waitForScene();
  }
  
  /**
   * Wait for the main scene to be initialized
   * @private
   */
  _waitForScene() {
    // Check if scene is already initialized (from main.js)
    if (typeof scene !== 'undefined' && scene !== null) {
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.sceneContentGroup = sceneContentGroup || null;
      // Prefer flattenableGroup for anything that should squash with the time axis
      if (typeof flattenableGroup !== 'undefined' && flattenableGroup) {
        this.flattenableGroup = flattenableGroup;
      }
      this._setupEventListeners();
      return;
    }
    
    // If not ready, wait a bit and try again
    setTimeout(() => {
      this._waitForScene();
    }, 100);
  }

  /**
   * Set up internal event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for scene events and forward them
    // This will be implemented when event system is added
  }

  /**
   * Emit an event to registered handlers
   * @private
   */
  _emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
      }
    });
  }

  // ============================================
  // LAYER MANAGEMENT
  // ============================================

  /**
   * Add a new layer
   * @param {string} layerId - Unique identifier for the layer
   * @param {Object} config - Layer configuration
   * @param {string} config.color - Layer color (hex)
   * @param {boolean} config.visible - Initial visibility
   * @param {number} config.opacity - Opacity (0-1)
   * @param {string} config.name - Display name
   */
  addLayer(layerId, config = {}) {
    if (this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} already exists. Use updateLayerStyle() to modify.`);
      return;
    }

    const layerConfig = {
      id: layerId,
      name: config.name || layerId,
      color: config.color || '#ffffff',
      visible: config.visible !== false,
      opacity: config.opacity !== undefined ? config.opacity : 1.0,
      filter: config.filter || null,
      ...config
    };

    this.layers.set(layerId, layerConfig);
    this.events.set(layerId, []);

    // Render the layer (even if empty)
    this._renderLayer(layerId);

    this._emit('layerAdded', { layerId, config: layerConfig });
  }

  /**
   * Remove a layer
   * @param {string} layerId - Layer identifier
   */
  removeLayer(layerId) {
    if (!this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} does not exist.`);
      return;
    }

    // Remove all event objects from scene
    this._removeLayerObjects(layerId);

    this.layers.delete(layerId);
    this.events.delete(layerId);

    this._emit('layerRemoved', { layerId });
  }

  /**
   * Set layer visibility
   * @param {string} layerId - Layer identifier
   * @param {boolean} visible - Visibility state
   */
  setLayerVisibility(layerId, visible) {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.warn(`Layer ${layerId} does not exist.`);
      return;
    }

    layer.visible = visible;
    this._updateLayerVisibility(layerId, visible);
    this._emit('layerVisibilityChanged', { layerId, visible });
  }

  /**
   * Update layer style
   * @param {string} layerId - Layer identifier
   * @param {Object} style - Style updates
   */
  updateLayerStyle(layerId, style) {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.warn(`Layer ${layerId} does not exist.`);
      return;
    }

    Object.assign(layer, style);
    this._renderLayer(layerId); // Re-render with new style
    this._emit('layerStyleChanged', { layerId, style });
  }

  /**
   * Check if layer exists
   * @param {string} layerId - Layer identifier
   * @returns {boolean}
   */
  hasLayer(layerId) {
    return this.layers.has(layerId);
  }

  /**
   * Get layer configuration
   * @param {string} layerId - Layer identifier
   * @returns {Object|null}
   */
  getLayer(layerId) {
    return this.layers.get(layerId) || null;
  }

  /**
   * Get all layer IDs
   * @returns {string[]}
   */
  getLayerIds() {
    return Array.from(this.layers.keys());
  }

  // ============================================
  // EVENT MANAGEMENT
  // ============================================

  /**
   * Add events to a layer
   * @param {string} layerId - Layer identifier
   * @param {Array} events - Array of VEVENT objects (RFC 5545 format)
   *                         Can also accept Google Calendar Events (will be converted)
   */
  addEvents(layerId, events) {
    if (!this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} does not exist. Creating it.`);
      this.addLayer(layerId);
    }

    const existingEvents = this.events.get(layerId) || [];
    const newEvents = Array.isArray(events) ? events : [events];
    
    // Convert to VEVENT format if needed
    const vevents = newEvents.map(e => {
      // Check if VEvent is available
      if (typeof VEvent !== 'undefined') {
        // If it's already a VEvent instance, use it
        if (e instanceof VEvent) {
          return e;
        }
        // If it looks like a Google Event, convert it
        if (e.id && (e.start || e.startTime)) {
          return VEvent.fromGoogleEvent(e);
        }
        // If it's already VEVENT JSON format, create VEvent from it
        if (e.uid && e.dtstart) {
          return VEvent.fromJSON(e);
        }
      }
      // Legacy format support - try to adapt
      console.warn('Event format not recognized, attempting legacy conversion:', e);
      return this._adaptLegacyEvent(e);
    });

    // Merge events (avoid duplicates by UID)
    const eventMap = new Map();
    existingEvents.forEach(e => {
      const uid = (typeof VEvent !== 'undefined' && e instanceof VEvent ? e.uid : e.uid || e.id) || JSON.stringify(e);
      eventMap.set(uid, e);
    });
    vevents.forEach(e => {
      const uid = (typeof VEvent !== 'undefined' && e instanceof VEvent ? e.uid : e.uid || e.id) || JSON.stringify(e);
      eventMap.set(uid, e);
    });

    this.events.set(layerId, Array.from(eventMap.values()));
    this._renderLayer(layerId);
  }

  /**
   * Add a single event to a layer (convenience for API callers).
   * @param {string} layerId - Layer identifier (created if missing)
   * @param {Object} event - One VEVENT-like or Google Calendar Event
   */
  addEvent(layerId, event) {
    this.addEvents(layerId, [event]);
  }

  /** Default palette for event lines when color is not specified (each event gets its own color) */
  static get EVENT_LINE_PALETTE() {
    return [
      '#00b4d8', '#ef476f', '#06d6a0', '#ffd166', '#9b5de5',
      '#00f5d4', '#f15bb5', '#fee440', '#7b2cbf', '#2ec4b6'
    ];
  }

  /**
   * Add event lines (line segments on the helix). Each line is { start, end, label?, color? }.
   * If color is omitted, a color from the palette is assigned so each event has its own color.
   * @param {string} layerId - Layer identifier (created if missing)
   * @param {Array<{ start: Date|string, end: Date|string, label?: string, color?: string }>} lines - Line segments to add
   */
  addEventLines(layerId, lines) {
    if (!this.layers.has(layerId)) {
      this.addLayer(layerId);
    }
    const palette = CircaevumGL.EVENT_LINE_PALETTE;
    const existing = this.eventLines.get(layerId) || [];
    const newLines = Array.isArray(lines) ? lines : [lines];
    const normalized = newLines.map(ln => {
      const start = ln.start instanceof Date ? ln.start : new Date(ln.start);
      const end = ln.end instanceof Date ? ln.end : new Date(ln.end);
      let color = ln.color != null ? ln.color : null;
      if (color == null) {
        color = palette[this._eventLineColorIndex % palette.length];
        this._eventLineColorIndex += 1;
      }
      return {
        start,
        end,
        label: ln.label != null ? ln.label : null,
        color,
        category: ln.category != null ? ln.category : 'Default'
      };
    }).filter(ln => !isNaN(ln.start.getTime()) && !isNaN(ln.end.getTime()) && ln.end > ln.start);
    this.eventLines.set(layerId, existing.concat(normalized));
    this._renderLayer(layerId);
  }

  /**
   * Get event lines for a layer
   * @param {string} layerId - Layer identifier
   * @returns {Array<{ start: Date, end: Date, label?: string, color?: string }>}
   */
  getEventLines(layerId) {
    return this.eventLines.get(layerId) || [];
  }

  /**
   * Remove event lines from a layer
   * @param {string} layerId - Layer identifier
   * @param {Array<number>|undefined} indices - If provided, remove lines at these indices; otherwise remove all
   */
  removeEventLines(layerId, indices) {
    if (indices === undefined || indices === null) {
      this.eventLines.set(layerId, []);
    } else {
      const arr = this.eventLines.get(layerId) || [];
      const toRemove = new Set(Array.isArray(indices) ? indices : [indices]);
      this.eventLines.set(layerId, arr.filter((_, i) => !toRemove.has(i)));
    }
    this._renderLayer(layerId);
  }

  /**
   * Remove events from a layer
   * @param {string} layerId - Layer identifier
   * @param {Array|string} eventUids - Event UIDs to remove (RFC 5545 UID)
   */
  removeEvents(layerId, eventUids) {
    const events = this.events.get(layerId) || [];
    const uidsToRemove = Array.isArray(eventUids) ? eventUids : [eventUids];
    
    const filtered = events.filter(e => {
      const uid = (typeof VEvent !== 'undefined' && e instanceof VEvent ? e.uid : e.uid || e.id) || JSON.stringify(e);
      return !uidsToRemove.includes(uid);
    });

    this.events.set(layerId, filtered);
    this._renderLayer(layerId);
  }

  /**
   * Update events in a layer
   * @param {string} layerId - Layer identifier
   * @param {Array} events - Updated events
   */
  updateEvents(layerId, events) {
    this.events.set(layerId, Array.isArray(events) ? events : [events]);
    this._renderLayer(layerId);
  }

  /**
   * Get events for a layer
   * @param {string} layerId - Layer identifier
   * @returns {Array}
   */
  getEvents(layerId) {
    return this.events.get(layerId) || [];
  }

  /**
   * Ingest event data from an external source (e.g. account-managed React page).
   * Creates or updates the layer and replaces its events with the provided set.
   * @param {string} layerId - Layer identifier (e.g. 'account', 'session-26Q1W01')
   * @param {Array} events - Array of VEVENT-like or Google Calendar Event objects
   * @param {Object} options - Optional: { sessionId?: string } e.g. { sessionId: '26Q1W01' }
   */
  ingestEvents(layerId, events, options = {}) {
    if (options.layerStyles && typeof options.layerStyles === 'object') {
      this.layerStylesByCategory = options.layerStyles;
    }
    if (!this.layers.has(layerId)) {
      this.addLayer(layerId, {
        name: options.sessionId ? `Session ${options.sessionId}` : layerId,
        ...(options.sessionId && { sessionId: options.sessionId })
      });
    }
    const layer = this.layers.get(layerId);
    if (options.sessionId) {
      layer.sessionId = options.sessionId;
    }
    this.updateEvents(layerId, Array.isArray(events) ? events : [events]);
    this._emit('eventsIngested', { layerId, count: (Array.isArray(events) ? events : [events]).length, sessionId: options.sessionId });
  }

  /**
   * Get EventObject descriptors for a layer (for API consumers; no Three.js refs).
   * Each descriptor has: uid, summary, start, end, layerId, color?, key?, dtstart?, dtend?, etc.
   * @param {string} layerId - Layer identifier
   * @returns {Array<{ uid: string, summary: string|null, start: Date|null, end: Date|null, layerId: string, color?: string, key?: string }>}
   */
  getEventObjects(layerId) {
    const events = this.events.get(layerId) || [];
    const list = [];
    for (const e of events) {
      let start = null;
      let end = null;
      let uid = '';
      let summary = null;
      if (typeof VEvent !== 'undefined' && e instanceof VEvent) {
        uid = e.uid || '';
        summary = e.summary || null;
        start = e.getStartDate();
        end = e.getEndDate();
      } else {
        uid = e.uid || e.id || '';
        summary = e.summary || e.title || null;
        if (e.dtstart) {
          if (e.dtstart.dateTime) {
            start = new Date(e.dtstart.dateTime);
          } else if (e.dtstart.date) {
            start = new Date(e.dtstart.date + 'T00:00:00Z');
          } else if (typeof e.dtstart === 'string') {
            const d = new Date(e.dtstart);
            start = !isNaN(d.getTime()) ? d : null;
          }
        } else {
          const rawStart = e.startTime || e.start || e.date;
          if (rawStart instanceof Date) start = rawStart;
          else if (rawStart) {
            const d = new Date(rawStart);
            start = !isNaN(d.getTime()) ? d : null;
          } else {
            start = null;
          }
        }
        if (e.dtend) {
          if (e.dtend.dateTime) {
            end = new Date(e.dtend.dateTime);
          } else if (e.dtend.date) {
            end = new Date(e.dtend.date + 'T00:00:00Z');
          } else if (typeof e.dtend === 'string') {
            const d = new Date(e.dtend);
            end = !isNaN(d.getTime()) ? d : null;
          }
        } else {
          const rawEnd = e.endTime || e.end;
          if (rawEnd instanceof Date) end = rawEnd;
          else if (rawEnd) {
            const d = new Date(rawEnd);
            end = !isNaN(d.getTime()) ? d : null;
          } else {
            end = null;
          }
        }
      }
      const color = e.color ?? e.colorId ?? null;
      const category = (e.category ?? (Array.isArray(e.categories) && e.categories[0]) ?? 'Default');
      list.push({
        uid,
        summary,
        start,
        end,
        layerId,
        category: category || 'Default',
        color: color || undefined,
        key: e.key,
        description: e.description,
        location: e.location,
        dtstart: e.dtstart,
        dtend: e.dtend
      });
    }
    return list;
  }

  // ============================================
  // CAMERA & NAVIGATION
  // ============================================

  /**
   * Set zoom level (1-9)
   * @param {number} level - Zoom level
   */
  setZoomLevel(level) {
    if (level < 1 || level > 9) {
      console.warn(`Invalid zoom level: ${level}. Must be 1-9.`);
      return;
    }

    this.options.zoomLevel = level;
    
    // Use existing setZoomLevel function if available
    if (typeof setZoomLevel === 'function') {
      setZoomLevel(level);
    }

    this._emit('zoomChanged', { level });
  }

  /**
   * Get current zoom level
   * @returns {number}
   */
  getZoomLevel() {
    return this.options.zoomLevel;
  }

  /**
   * Navigate to a specific time
   * @param {Date|string} date - Target date
   */
  navigateToTime(date) {
    const targetDate = date instanceof Date ? date : new Date(date);
    
    // Prefer host app helper so Selected Time + Earth position are updated consistently.
    if (typeof setSelectedDateTime === 'function') {
      setSelectedDateTime(targetDate);
    } else if (typeof applySelectedDateToZoomLevel === 'function') {
      applySelectedDateToZoomLevel(targetDate, this.options.zoomLevel);
      if (typeof createPlanets === 'function') {
        createPlanets(this.options.zoomLevel);
      }
    }

    this._emit('timeChanged', { date: targetDate });
  }

  /**
   * Auto-zoom to fit a layer's events. Uses full span (min of all starts, max of all ends) so
   * long-term events get zoom 2/3, and focuses on the midpoint of that span.
   * @param {string} layerId - Layer identifier
   */
  fitToLayer(layerId) {
    const events = this.getEvents(layerId);
    if (events.length === 0) {
      console.warn(`Layer ${layerId} has no events to fit to.`);
      return;
    }

    const getStart = (e) => {
      if (typeof VEvent !== 'undefined' && e instanceof VEvent) return e.getStartDate();
      if (e.dtstart) {
        if (e.dtstart.dateTime) return new Date(e.dtstart.dateTime);
        if (e.dtstart.date) return new Date(e.dtstart.date + 'T00:00:00Z');
      }
      const s = e.startTime || e.start || e.date;
      return s instanceof Date ? s : (s ? new Date(s) : null);
    };
    const getEnd = (e) => {
      if (typeof VEvent !== 'undefined' && e instanceof VEvent) return e.getEndDate();
      if (e.dtend) {
        if (e.dtend.dateTime) return new Date(e.dtend.dateTime);
        if (e.dtend.date) return new Date(e.dtend.date + 'T00:00:00Z');
      }
      const s = getStart(e);
      if (e.endTime || e.end) {
        const end = e.endTime || e.end;
        return end instanceof Date ? end : new Date(end);
      }
      return s ? new Date(s.getTime() + 24 * 60 * 60 * 1000) : null;
    };

    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const e of events) {
      const start = getStart(e);
      const end = getEnd(e);
      if (start && !isNaN(start.getTime())) minStart = Math.min(minStart, start.getTime());
      if (end && !isNaN(end.getTime())) maxEnd = Math.max(maxEnd, end.getTime());
    }
    if (minStart === Infinity || maxEnd === -Infinity) return;
    if (maxEnd < minStart) maxEnd = minStart + 24 * 60 * 60 * 1000;

    const startTime = new Date(minStart);
    const endTime = new Date(maxEnd);
    const duration = maxEnd - minStart;
    const days = duration / (1000 * 60 * 60 * 24);

    let zoomLevel = 2;
    if (days <= 1) zoomLevel = 9;
    else if (days <= 7) zoomLevel = 8;
    else if (days <= 30) zoomLevel = 7;
    else if (days <= 90) zoomLevel = 5;
    else if (days <= 365) zoomLevel = 4;
    else if (days <= 365 * 10) zoomLevel = 3;
    else zoomLevel = 2;

    const midTime = new Date((minStart + maxEnd) / 2);
    this.setZoomLevel(zoomLevel);
    this.navigateToTime(midTime);
  }

  /**
   * Auto-zoom to fit multiple layers
   * @param {string[]} layerIds - Layer identifiers
   */
  fitToLayers(layerIds) {
    const allEvents = [];
    layerIds.forEach(layerId => {
      allEvents.push(...this.getEvents(layerId));
    });

    if (allEvents.length === 0) return;

    // Create temporary layer and fit to it
    const tempLayerId = '__temp_fit__';
    this.addLayer(tempLayerId, { visible: false });
    this.addEvents(tempLayerId, allEvents);
    this.fitToLayer(tempLayerId);
    this.removeLayer(tempLayerId);
  }

  // ============================================
  // FILTERING
  // ============================================

  /**
   * Set filter for a layer
   * @param {string} layerId - Layer identifier
   * @param {Object} filter - Filter configuration
   */
  setLayerFilter(layerId, filter) {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.warn(`Layer ${layerId} does not exist.`);
      return;
    }

    layer.filter = filter;
    this._renderLayer(layerId); // Re-render with filter applied
    this._emit('layerFilterChanged', { layerId, filter });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Subscribe to an event
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function to remove
   */
  off(eventType, callback) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // ============================================
  // INTERNAL RENDERING METHODS
  // ============================================

  /**
   * Render a layer's events
   * @private
   */
  _renderLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer || !layer.visible) {
      this._removeLayerObjects(layerId);
      return;
    }

    const events = this.getEvents(layerId);
    
    // Apply filter if present
    let filteredEvents = events;
    if (layer.filter) {
      filteredEvents = this._applyFilter(events, layer.filter);
    }
    filteredEvents = this._applyTimelineScopeFilter(filteredEvents);

    // Remove existing objects for this layer
    this._removeLayerObjects(layerId);

    const allObjects = [];

    // Decide which scene group to attach to: flattenableGroup flattens with time markers, else fallback.
    const targetGroup = this.flattenableGroup || this.sceneContentGroup;
    const worldSpaceGroup =
      this.flattenableGroup && this.sceneContentGroup ? this.sceneContentGroup : null;

    // Per-category styles from wrapper (layer name -> style); apply when rendering each event
    const layerConfigWithStyles = {
      ...layer,
      layerStylesByCategory: this.layerStylesByCategory || {}
    };

    // Create event objects using event renderer
    if (typeof EventRenderer !== 'undefined' && EventRenderer.createEventObjects) {
      const objects = EventRenderer.createEventObjects(
        filteredEvents,
        layerConfigWithStyles,
        targetGroup,
        this.scene,
        worldSpaceGroup
      );
      allObjects.push(...objects);
    }

    // Create event line objects (addEventLines API)
    const linesRaw = this.eventLines.get(layerId) || [];
    const lines = this._filterEventLinesForTimeline(linesRaw);
    if (lines.length > 0 && typeof EventRenderer !== 'undefined' && EventRenderer.createEventLineObjects) {
      const lineObjects = EventRenderer.createEventLineObjects(
        lines,
        layerConfigWithStyles,
        targetGroup,
        undefined,
        worldSpaceGroup
      );
      allObjects.push(...lineObjects);
    }

    if (allObjects.length > 0 || lines.length > 0) {
      if (!this._layerObjects) {
        this._layerObjects = new Map();
      }
      this._layerObjects.set(layerId, allObjects);
    }
    if (filteredEvents.length === 0 && lines.length === 0 && typeof EventRenderer === 'undefined') {
      console.warn('EventRenderer not available. Events will not be rendered.');
    }
  }

  /**
   * Calendar year used for "this year" event scope (follows main scene selected time when available).
   * @private
   */
  _getTimelineFilterYear() {
    if (typeof getSelectedDateTime === 'function') {
      try {
        const d = getSelectedDateTime();
        if (d && !isNaN(d.getTime())) return d.getFullYear();
      } catch (e) { /* ignore */ }
    }
    return new Date().getFullYear();
  }

  /**
   * Start/end Dates for overlap test (same rules as getEventObjects).
   * @private
   */
  _getEventDateBounds(event) {
    let start = null;
    let end = null;
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      start = event.getStartDate();
      end = event.getEndDate();
    } else {
      if (event.dtstart) {
        if (event.dtstart.dateTime) start = new Date(event.dtstart.dateTime);
        else if (event.dtstart.date) start = new Date(event.dtstart.date + 'T00:00:00Z');
        else if (typeof event.dtstart === 'string') {
          const d = new Date(event.dtstart);
          start = !isNaN(d.getTime()) ? d : null;
        }
      } else {
        const rawStart = event.startTime || event.start || event.date;
        if (rawStart instanceof Date) start = rawStart;
        else if (rawStart) {
          const d = new Date(rawStart);
          start = !isNaN(d.getTime()) ? d : null;
        }
      }
      if (event.dtend) {
        if (event.dtend.dateTime) end = new Date(event.dtend.dateTime);
        else if (event.dtend.date) end = new Date(event.dtend.date + 'T00:00:00Z');
        else if (typeof event.dtend === 'string') {
          const d = new Date(event.dtend);
          end = !isNaN(d.getTime()) ? d : null;
        }
      } else {
        const rawEnd = event.endTime || event.end;
        if (rawEnd instanceof Date) end = rawEnd;
        else if (rawEnd) {
          const d = new Date(rawEnd);
          end = !isNaN(d.getTime()) ? d : null;
        }
      }
    }
    if (start && isNaN(start.getTime())) start = null;
    if (end && isNaN(end.getTime())) end = null;
    return { start, end };
  }

  /**
   * Event overlaps [Jan 1 .. Dec 31] of `year` in local calendar sense.
   * @private
   */
  _eventOverlapsYear(event, year) {
    const { start, end } = this._getEventDateBounds(event);
    if (!start) return false;
    const rangeStart = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    const rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    const s = start.getTime();
    const e = (end && !isNaN(end.getTime())) ? end.getTime() : s;
    return s <= rangeEnd && e >= rangeStart;
  }

  _lineOverlapsYear(line, year) {
    const rangeStart = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    const rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    const s = line.start.getTime();
    const e = line.end.getTime();
    return s <= rangeEnd && e >= rangeStart;
  }

  _applyTimelineScopeFilter(events) {
    if (this.timelineEventFilter !== 'year') return events;
    const y = this._getTimelineFilterYear();
    return events.filter(e => this._eventOverlapsYear(e, y));
  }

  _filterEventLinesForTimeline(lines) {
    if (this.timelineEventFilter !== 'year') return lines;
    const y = this._getTimelineFilterYear();
    return lines.filter(ln => this._lineOverlapsYear(ln, y));
  }

  /**
   * Re-render every layer (e.g. after selected year changes while in "year" scope).
   */
  refreshAllEventLayers() {
    for (const layerId of this.layers.keys()) {
      this._renderLayer(layerId);
    }
  }

  /**
   * @param {'year'|'all'} mode - 'year' = only events overlapping selected calendar year
   */
  setTimelineEventFilter(mode) {
    const next = mode === 'all' ? 'all' : 'year';
    if (this.timelineEventFilter === next) return;
    this.timelineEventFilter = next;
    this.refreshAllEventLayers();
    this._emit('timelineEventFilterChanged', { filter: next });
  }

  getTimelineEventFilter() {
    return this.timelineEventFilter;
  }

  /**
   * Apply filter to events
   * @private
   */
  _applyFilter(events, filter) {
    return events.filter(event => {
      // Date range filter
      if (filter.dateRange) {
        let eventTime = null;
        
      // Handle VEVENT format
      if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
        eventTime = event.getStartDate();
      } else if (event.dtstart) {
          if (event.dtstart.dateTime) eventTime = new Date(event.dtstart.dateTime);
          else if (event.dtstart.date) eventTime = new Date(event.dtstart.date + 'T00:00:00Z');
        } else {
          // Legacy format
          const eventDate = event.startTime || event.start || event.date;
          eventTime = eventDate instanceof Date ? eventDate : new Date(eventDate);
        }
        
        if (eventTime) {
          if (filter.dateRange.start && eventTime < filter.dateRange.start) return false;
          if (filter.dateRange.end && eventTime > filter.dateRange.end) return false;
        }
      }

      // Event type filter
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        const eventType = event.type || event.categories?.[0] || null;
        if (eventType && !filter.eventTypes.includes(eventType)) return false;
      }

      return true;
    });
  }

  /**
   * Adapt legacy event format to VEVENT
   * @private
   */
  _adaptLegacyEvent(event) {
    // If VEvent is available, convert to VEVENT format
    if (typeof VEvent !== 'undefined') {
      const veventData = {
        uid: event.id || event.uid || `legacy-${Date.now()}-${Math.random()}`,
        summary: event.title || event.summary || null,
        description: event.description || null,
        location: event.location || null,
        status: 'CONFIRMED'
      };

      // Handle start time
      const startTime = event.startTime || event.start || event.date;
      if (startTime) {
        const startDate = startTime instanceof Date ? startTime : new Date(startTime);
        veventData.dtstart = {
          dateTime: startDate.toISOString(),
          timeZone: 'UTC'
        };
      }

      // Handle end time
      const endTime = event.endTime || event.end;
      if (endTime) {
        const endDate = endTime instanceof Date ? endTime : new Date(endTime);
        veventData.dtend = {
          dateTime: endDate.toISOString(),
          timeZone: 'UTC'
        };
      }

      return VEvent.fromJSON(veventData);
    }
    
    // Fallback: return event as-is if VEvent not available
    return event;
  }

  /**
   * Highlight one event in a layer (e.g. while editing). Pass uid or null to clear.
   * @param {string} layerId - Layer id (e.g. 'user-events')
   * @param {string|null} uid - Event uid to highlight, or null to clear highlight
   */
  setEventHighlight(layerId, uid) {
    if (!this._layerObjects || !this._layerObjects.has(layerId)) return
    const objects = this._layerObjects.get(layerId)
    const highlight = uid != null && String(uid).trim() !== ''
    function setHighlight(o, match, highlight) {
      if (o.material) {
        if (o.material.emissiveIntensity !== undefined) {
          o.material.emissiveIntensity = match && highlight ? 1 : 0.4
        }
        if (o.material.opacity !== undefined) {
          o.material.opacity = match && highlight ? 1 : (o.userData._baseOpacity != null ? o.userData._baseOpacity : 0.7)
        }
      }
      if (o.children) o.children.forEach((c) => setHighlight(c, match, highlight))
    }
    objects.forEach((obj) => {
      const match = obj.userData && obj.userData.eventUid === uid
      setHighlight(obj, match, highlight)
    })
  }

  /**
   * Remove all objects for a layer
   * @private
   */
  _removeLayerObjects(layerId) {
    if (!this._layerObjects || !this._layerObjects.has(layerId)) {
      return;
    }

    const objects = this._layerObjects.get(layerId);
    function disposeObject(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
      if (o.children && o.children.length) o.children.slice().forEach(disposeObject);
    }
    objects.forEach(obj => {
      if (obj.parent && typeof obj.parent.remove === 'function') {
        obj.parent.remove(obj);
      }
      disposeObject(obj);
    });

    this._layerObjects.delete(layerId);
  }

  /**
   * Update layer visibility
   * @private
   */
  _updateLayerVisibility(layerId, visible) {
    if (!this._layerObjects || !this._layerObjects.has(layerId)) {
      return;
    }

    const objects = this._layerObjects.get(layerId);
    objects.forEach(obj => {
      obj.visible = visible;
    });
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Destroy the instance and clean up resources
   */
  destroy() {
    // Remove all layers
    this.getLayerIds().forEach(layerId => {
      this.removeLayer(layerId);
    });

    // Clear event handlers
    this.eventHandlers.clear();

    // Clean up scene (if we own it)
    // Note: If scene is shared, we might not want to destroy it
    // This depends on the refactoring approach

    this._emit('destroyed', {});
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CircaevumGL;
} else {
  window.CircaevumGL = CircaevumGL;
}
