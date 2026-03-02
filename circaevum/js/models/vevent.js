/**
 * VEVENT Format (RFC 5545) Implementation
 * 
 * Reference: spec/schemas/vevent-rfc5545.md
 * 
 * This module provides:
 * - VEvent class for RFC 5545 VEVENT format
 * - Google Calendar Event → VEVENT adapter
 * - VEVENT validation
 * - iCalendar string conversion
 */

/**
 * VEvent class - RFC 5545 VEVENT format
 */
class VEvent {
  constructor(data = {}) {
    // Required fields
    this.uid = data.uid || null;
    this.dtstart = data.dtstart || null;
    
    // Optional fields
    this.dtend = data.dtend || null;
    this.duration = data.duration || null;
    this.summary = data.summary || null;
    this.description = data.description || null;
    this.location = data.location || null;
    this.status = data.status || 'CONFIRMED';
    this.created = data.created || null;
    this.lastModified = data.lastModified || null;
    this.dtstamp = data.dtstamp || null;
    this.rrule = data.rrule || null;
    this.exdate = data.exdate || [];
    this.categories = data.categories || [];
    this.color = data.color || null;
    this.class = data.class || 'PUBLIC';
    this.layerId = data.layerId || null;
  }

  /**
   * Validate VEvent according to RFC 5545 rules
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // UID is required
    if (!this.uid || typeof this.uid !== 'string' || this.uid.trim() === '') {
      errors.push('UID is required and must be non-empty');
    }

    // DTSTART is required
    if (!this.dtstart) {
      errors.push('DTSTART is required');
    } else {
      // Validate dtstart format
      if (this.dtstart.dateTime && !this._isValidISO8601(this.dtstart.dateTime)) {
        errors.push('DTSTART dateTime must be valid ISO 8601 format');
      }
      if (this.dtstart.date && !this._isValidDate(this.dtstart.date)) {
        errors.push('DTSTART date must be valid YYYY-MM-DD format');
      }
    }

    // If DTEND exists, validate it
    if (this.dtend) {
      if (this.dtend.dateTime && !this._isValidISO8601(this.dtend.dateTime)) {
        errors.push('DTEND dateTime must be valid ISO 8601 format');
      }
      if (this.dtend.date && !this._isValidDate(this.dtend.date)) {
        errors.push('DTEND date must be valid YYYY-MM-DD format');
      }

      // DTEND must be after DTSTART
      if (this.dtstart && this.dtend) {
        const start = this._getDateTime(this.dtstart);
        const end = this._getDateTime(this.dtend);
        if (start && end && end <= start) {
          errors.push('DTEND must be after DTSTART');
        }
      }
    }

    // STATUS must be valid
    const validStatuses = ['CONFIRMED', 'TENTATIVE', 'CANCELLED'];
    if (this.status && !validStatuses.includes(this.status)) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to JSON (for API/storage)
   * @returns {Object}
   */
  toJSON() {
    return {
      uid: this.uid,
      dtstart: this.dtstart,
      dtend: this.dtend,
      duration: this.duration,
      summary: this.summary,
      description: this.description,
      location: this.location,
      status: this.status,
      created: this.created,
      lastModified: this.lastModified,
      dtstamp: this.dtstamp,
      rrule: this.rrule,
      exdate: this.exdate,
      categories: this.categories,
      color: this.color,
      class: this.class,
      layerId: this.layerId
    };
  }

  /**
   * Convert to iCalendar string format
   * @returns {string}
   */
  toICalendar() {
    let ical = 'BEGIN:VEVENT\n';
    
    if (this.uid) ical += `UID:${this.uid}\n`;
    if (this.dtstart) {
      if (this.dtstart.dateTime) {
        ical += `DTSTART:${this._formatICalDateTime(this.dtstart.dateTime)}\n`;
      } else if (this.dtstart.date) {
        ical += `DTSTART;VALUE=DATE:${this.dtstart.date.replace(/-/g, '')}\n`;
      }
    }
    if (this.dtend) {
      if (this.dtend.dateTime) {
        ical += `DTEND:${this._formatICalDateTime(this.dtend.dateTime)}\n`;
      } else if (this.dtend.date) {
        ical += `DTEND;VALUE=DATE:${this.dtend.date.replace(/-/g, '')}\n`;
      }
    }
    if (this.summary) ical += `SUMMARY:${this._escapeICalText(this.summary)}\n`;
    if (this.description) ical += `DESCRIPTION:${this._escapeICalText(this.description)}\n`;
    if (this.location) ical += `LOCATION:${this._escapeICalText(this.location)}\n`;
    if (this.status) ical += `STATUS:${this.status}\n`;
    if (this.created) ical += `CREATED:${this._formatICalDateTime(this.created)}\n`;
    if (this.lastModified) ical += `LAST-MODIFIED:${this._formatICalDateTime(this.lastModified)}\n`;
    if (this.dtstamp) ical += `DTSTAMP:${this._formatICalDateTime(this.dtstamp)}\n`;
    if (this.color) ical += `COLOR:${this.color}\n`;
    if (this.class) ical += `CLASS:${this.class}\n`;
    
    ical += 'END:VEVENT';
    return ical;
  }

  /**
   * Get start time as Date object
   * @returns {Date|null}
   */
  getStartDate() {
    return this._getDateTime(this.dtstart);
  }

  /**
   * Get end time as Date object
   * @returns {Date|null}
   */
  getEndDate() {
    return this._getDateTime(this.dtend);
  }

  // Private helper methods

  _getDateTime(dt) {
    if (!dt) return null;
    if (dt.dateTime) return new Date(dt.dateTime);
    if (dt.date) return new Date(dt.date + 'T00:00:00Z');
    return null;
  }

  _isValidISO8601(str) {
    if (typeof str !== 'string') return false;
    const date = new Date(str);
    return !isNaN(date.getTime()) && str.includes('T');
  }

  _isValidDate(str) {
    if (typeof str !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(str);
  }

  _formatICalDateTime(iso8601) {
    const date = new Date(iso8601);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  _escapeICalText(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * Create VEvent from Google Calendar Event
   * @param {Object} googleEvent - Google Calendar API Event
   * @returns {VEvent}
   */
  static fromGoogleEvent(googleEvent) {
    if (!googleEvent || !googleEvent.id) {
      throw new Error('Invalid Google Event: missing id');
    }

    // Map Google color IDs to hex colors
    const colorMap = {
      '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff', '4': '#ff887c',
      '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
      '9': '#5484ed', '10': '#51b749', '11': '#dc2127'
    };

    const vevent = new VEvent({
      uid: googleEvent.id,
      summary: googleEvent.summary || null,
      description: googleEvent.description || null,
      location: googleEvent.location || null,
      status: googleEvent.status ? googleEvent.status.toUpperCase() : 'CONFIRMED',
      created: googleEvent.created || null,
      lastModified: googleEvent.updated || null,
      color: googleEvent.colorId ? (colorMap[googleEvent.colorId] || null) : null,
      layerId: googleEvent.layerId || null
    });

    // Handle start time
    if (googleEvent.start) {
      if (googleEvent.start.dateTime) {
        vevent.dtstart = {
          dateTime: googleEvent.start.dateTime,
          timeZone: googleEvent.start.timeZone || 'UTC'
        };
      } else if (googleEvent.start.date) {
        vevent.dtstart = {
          date: googleEvent.start.date
        };
      }
    }

    // Handle end time
    if (googleEvent.end) {
      if (googleEvent.end.dateTime) {
        vevent.dtend = {
          dateTime: googleEvent.end.dateTime,
          timeZone: googleEvent.end.timeZone || 'UTC'
        };
      } else if (googleEvent.end.date) {
        vevent.dtend = {
          date: googleEvent.end.date
        };
      }
    }

    // Set dtstamp to current time if not provided
    if (!vevent.dtstamp) {
      vevent.dtstamp = new Date().toISOString();
    }

    return vevent;
  }

  /**
   * Create VEvent from JSON (from storage)
   * @param {Object} json - VEVENT JSON object
   * @returns {VEvent}
   */
  static fromJSON(json) {
    return new VEvent(json);
  }

  /**
   * Create VEvent from iCalendar string
   * @param {string} ical - iCalendar VEVENT string
   * @returns {VEvent}
   */
  static fromICalendar(ical) {
    // Basic parser - can be enhanced for full RFC 5545 support
    const lines = ical.split('\n');
    const data = {};
    
    for (const line of lines) {
      if (line.startsWith('UID:')) {
        data.uid = line.substring(4).trim();
      } else if (line.startsWith('DTSTART')) {
        const value = line.includes(':') ? line.split(':')[1] : '';
        if (line.includes('VALUE=DATE')) {
          const date = value.match(/(\d{4})(\d{2})(\d{2})/);
          if (date) {
            data.dtstart = { date: `${date[1]}-${date[2]}-${date[3]}` };
          }
        } else {
          const dt = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
          if (dt) {
            data.dtstart = {
              dateTime: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}Z`
            };
          }
        }
      } else if (line.startsWith('DTEND')) {
        const value = line.includes(':') ? line.split(':')[1] : '';
        if (line.includes('VALUE=DATE')) {
          const date = value.match(/(\d{4})(\d{2})(\d{2})/);
          if (date) {
            data.dtend = { date: `${date[1]}-${date[2]}-${date[3]}` };
          }
        } else {
          const dt = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
          if (dt) {
            data.dtend = {
              dateTime: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}Z`
            };
          }
        }
      } else if (line.startsWith('SUMMARY:')) {
        data.summary = line.substring(8).trim();
      } else if (line.startsWith('DESCRIPTION:')) {
        data.description = line.substring(12).trim();
      } else if (line.startsWith('LOCATION:')) {
        data.location = line.substring(9).trim();
      } else if (line.startsWith('STATUS:')) {
        data.status = line.substring(7).trim();
      }
    }

    return new VEvent(data);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VEvent;
} else {
  window.VEvent = VEvent;
}
