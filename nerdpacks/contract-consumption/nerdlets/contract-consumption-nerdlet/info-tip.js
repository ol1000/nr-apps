import React from 'react';

// Everything is inline: New Relic's global CSS styles <button> (large padding, min-height, font size) and beats
// stylesheet rules, which is what made the first version huge. Dark ink on a light base is inverted by New Relic in its
// dark theme, so the pop-up follows the theme too.
const BTN = {
  boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 12, height: 12, minWidth: 12, minHeight: 12, maxWidth: 12, maxHeight: 12, padding: 0, margin: 0,
  borderRadius: '50%', border: '1px solid #aab2bf', background: 'transparent', color: '#7b8594',
  fontFamily: 'inherit', fontSize: 8, fontWeight: 700, fontStyle: 'normal', lineHeight: '10px', textTransform: 'none', letterSpacing: 0,
  cursor: 'help', overflow: 'hidden'
};
const WRAP = { display: 'inline-block', marginLeft: 4, verticalAlign: 'middle', lineHeight: 1, textTransform: 'none', letterSpacing: 0, fontWeight: 400 };
const POP = { background: '#1d252c', color: '#f9fafb', border: '1px solid #1d252c' };

/**
 * A small "i" button that explains a value. Opens on hover, keyboard focus or click; Escape or moving away closes it.
 * The popover is position:fixed (measured from the button) so scroll containers around tables cannot clip it.
 */
export default class InfoTip extends React.Component {
  constructor(props) {
    super(props);
    this.state = { open: false, pos: null };
    this.btn = React.createRef();
  }

  componentWillUnmount() {
    this.unlisten();
  }

  listen() {
    window.addEventListener('scroll', this.hide, true);
    window.addEventListener('resize', this.hide);
  }

  unlisten() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', this.hide, true);
    window.removeEventListener('resize', this.hide);
  }

  show = () => {
    let pos = null;
    const el = this.btn.current;
    if (el && el.getBoundingClientRect && typeof window !== 'undefined') {
      const r = el.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 16);
      const above = r.bottom + 190 > window.innerHeight && r.top > 190;
      pos = { width, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8)), top: above ? r.top - 6 : r.bottom + 6, above };
      this.listen();
    }
    this.setState({ open: true, pos });
  };

  hide = () => {
    this.unlisten();
    this.setState({ open: false });
  };

  toggle = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (this.state.open) this.hide(); else this.show();
  };

  onKeyDown = e => {
    if (e.key === 'Escape') this.hide();
  };

  render() {
    const { text, label } = this.props;
    const { open, pos } = this.state;
    return (
      <span className="info" style={WRAP}>
        <button
          ref={this.btn}
          type="button"
          className="info-btn"
          style={{ ...BTN, opacity: open ? 1 : 0.6, ...(open ? { color: '#2b66e0', borderColor: '#2b66e0' } : {}) }}
          aria-label={label ? `About ${label}` : 'More information'}
          aria-expanded={open}
          onMouseEnter={this.show}
          onMouseLeave={this.hide}
          onFocus={this.show}
          onBlur={this.hide}
          onClick={this.toggle}
          onKeyDown={this.onKeyDown}
        >
          i
        </button>
        {open ? (
          <span
            role="tooltip"
            className="info-pop"
            style={{ ...POP, position: 'fixed', zIndex: 2147483000, ...(pos ? { top: pos.top, left: pos.left, width: pos.width, transform: pos.above ? 'translateY(-100%)' : 'none' } : {}) }}
          >
            {text}
          </span>
        ) : null}
      </span>
    );
  }
}
