(function($) {

var eventNamespace = '.uispinner', // namespace for events on input
	focusCtrl;	// stores the currently focused spinner
				// note due to oddities in the focus/blur events, this is part of a two-part system for confirming focus
				// this must set to the control, and the focus variable must be true
				// this is because hitting up/down arrows causes focus to change, but blur event for previous control doesn't fire

$.widget("ui.spinner", {
	_init: function() {
		var self = this, // shortcut
			options = self.options,
			input = self.element,
			min = options.min,
			max = options.max,
			step = options.step,
			maxlength = -1, temp,
			type = input.attr("type");
			
		if ((input.get(0).tagName != "INPUT") || ((type != "text") && (type != "number"))) {
			console.error("Invalid target for ui.spinner");
			return;
		}
		
		// Now parse min, max, and step settings
		if ((min == null) && ((temp = input.attr("min")) != null))
			min = parseInt(temp);
		
		if ((max == null) && ((temp = input.attr("max")) != null))
			max = parseInt(temp);
		
		if (!step && ((temp = input.attr("step")) != null))
			if (temp != "any") {
				step = parseInt(temp);
				options.largeStep *= step;
			}
				
		if ((max != null) && (min != null)) {
			// ensure that min is less than or equal to max
			if (min > max) min = max;
			
			// fix min/max based on maxlength of the input
			maxlength = Math.max(Math.max(maxlength, (max + "").length), (min + "").length);
		}
			
		temp = input.get(0).maxLength;
		if (temp > 0) {
			maxlength = maxlength > 0 ? Math.min(temp, maxlength) : temp;
			temp = Math.pow(10, maxlength) - 1;
			if ((max == null) || (max > temp))
				max = temp;
			temp = -(temp + 1) / 10 + 1;
			if ((min == null) || (min < temp))
				min = temp;
		}
		
		if (maxlength > 0)
			input.attr("maxlength", maxlength);
					
		options.min = min;
		options.max = max;
		options.step = step || options.defaultStep;
		
		// Options are good, now create the spinner
		
		self._createButtons(input);
		self._change(true); // process initial value, but don't focus

		if (input.get(0).disabled)
			self.disable();
	},
	
	_createButtons: function(input) {
		function getMargin(margin) {
			return margin == "auto" ? 0 : parseInt(margin); // IE8 returns auto if no margin specified
		}

		var self = this, // shortcut, also used by events
			options = self.options,
			className = options.className,
			buttonWidth = options.width,
			box = $.support.boxModel,
			height = input.outerHeight(),
			rightMargin = options.oMargin = getMargin(input.css("margin-right")), // store original width and right margin for later destroy
			wrapper = self.wrapper = input.css({ width: (options.oWidth = (box ? input.width() : input.outerWidth())) - buttonWidth, 
												 marginRight: rightMargin + buttonWidth, textAlign: 'right' })
				.after('<span class="ui-spinner ui-widget"></span>').next(),
			btnContainer = self.btnContainer = $('<div class="ui-spinner-buttons"><div class="ui-spinner-up ui-spinner-button ui-state-default ui-corner-tr"><span class="ui-icon ui-icon-triangle-1-n">&nbsp;</span></div><div class="ui-spinner-down ui-spinner-button ui-state-default ui-corner-br"><span class="ui-icon ui-icon-triangle-1-s">&nbsp;</span></div></div>'),
			upButton, downButton,
			hoverDelay,
			hoverDelayCallback,
			hovered = false,
			focused = false,
			inKeyDown = false,
			inMouseDown = false,
			buttons, icons, showOn,
			keyDir, // stores direction key press is currently spinning
			rtl = input.get(0).dir == "rtl", // used to reverse left/right key directions
			
			// constant shortcuts
			active = 'ui-state-active',
			hover = 'ui-state-hover',
			keyCode = $.ui.keyCode, // better minimization
			up = keyCode.UP,
			down = keyCode.DOWN,
			right = keyCode.RIGHT,
			left = keyCode.LEFT,
			pageUp = keyCode.PAGE_UP,
			pageDown = keyCode.PAGE_DOWN,
			home = keyCode.HOME,
			end = keyCode.END,
			validKeys = [up, down, right, left, pageUp, pageDown, home, end, keyCode.BACKSPACE, keyCode.DELETE, keyCode.TAB],
			msie = $.browser.msie;
			
		if (className) wrapper.addClass(className);
		
		wrapper.append(btnContainer.css({ height: height, left: -buttonWidth-rightMargin,
			// use offset calculation to fix vertical position in Firefox
			// add an extra pixel in IE
			top: (input.offset().top - wrapper.offset().top + ($.browser.msie ? 0 : 0)) + 'px' }));
		
		buttons = self.buttons = btnContainer.find('.ui-spinner-button');
		buttons.css({ width: buttonWidth - (box ? buttons.outerWidth() - buttons.width() : 0), height: height/2 - (box ? buttons.outerHeight() - buttons.height() : 0) });
		upButton = $(buttons.get(0));
		downButton = $(buttons.get(1));
		
		// fix icon centering
		icons = buttons.find('.ui-icon');
		icons.css({ marginLeft: (buttons.innerWidth() - icons.width()) / 2, marginTop:  (buttons.innerHeight() - icons.height()) / 2 });
		
		btnContainer.width(buttons.outerWidth());

		showOn = self._getData('showOn');
		if (showOn == 'hover' || showOn == 'both')
			buttons.add(input).bind("mouseenter" + eventNamespace, hoverIn).bind("mouseleave" + eventNamespace, hoverOut);
		if (showOn != 'always')
			btnContainer.css('opacity', 0);
		
		buttons.hover(hoverButtonIn, hoverButtonOut)
			.mousedown(mouseDown)
			.mouseup(mouseUp)
			.mouseout(mouseUp);
		if (msie)
			buttons.dblclick(dblClick) // fixes dbl click not firing mouse down
				.bind("selectstart", function() {return false;}); // fixes IE8 dbl click selection highlight
		input.bind("keydown" + eventNamespace, keyDown)
			.bind("keyup" + eventNamespace, keyUp)
			.bind("change" + eventNamespace, function() { self._change(); })
			.bind("focus" + eventNamespace, focus)
			.bind("blur" + eventNamespace, blur);
		if (options.mouseWheel)
			$().bind($.browser.mozilla ? "DOMMouseScroll" : "mousewheel", mouseWheel); // bind to document so that mouse doesn't need to be over input
			
		function selectAll() { // in a function for compression
			self.element.select();
		}
		
		// events are declared in function so they have access to self variable and better minimization
		function keyDown(e) {
			var dir, large, limit,
				keyCode = e.keyCode; // shortcut for minimization
			if (e.ctrl || e.alt) return true; // ignore these events
			if (keyDir || invalidKey(keyCode)) return false; // only one direction at a time, and suppress invalid keys
			
			switch (keyCode) {
				case up:
				case pageUp:
					dir = 1;
					large = keyCode == pageUp;
					break;
					
				case down:
				case pageDown:
					dir = -1;
					large = keyCode == pageDown;
					break;
					
				case right:
				case left:
					dir = (keyCode == right) ^ rtl ? 1 : -1;
					break;
					
				case home:
					limit = self._getData('min');
					if (limit != null) self.setValue(limit);
					return false;
					
				case end:
					limit = self._getData('max');
					if (limit != null) self.setValue(limit);
					return false;
			}
			
			if (dir) { // only process if dir was set above
				if (!inKeyDown && !self._getData('disabled')) {
					keyDir = dir;
					self._change(); // in case value changed then direction pressed
					
					(dir > 0 ? upButton : downButton).addClass(active);
					self._doSpin(dir, large);
					
					self.spinCount = 1;
					self.inSpinTwo = false;
					inKeyDown = true;
					self._setTimer(self._spin, options.spinDelayOne, dir, large);
				}
				
				return false;
			}
		}
		
		function keyUp(e) {
			if (e.ctrl || e.alt) return true; // ignore these events
			if (invalidKey(e.keyCode)) return false;
			
			switch (e.keyCode) {
				case up:
				case right:
				case pageUp:
				case down:
				case left:
				case pageDown:
					(keyDir > 0 ? upButton : downButton).removeClass(active)
					keyDir = 0;
					self._clearTimer();
					inKeyDown = false;
					return false;
			}
		}
		
		function invalidKey(keyCode) {
			if ((keyCode == 109) // minus sign
				|| ((keyCode >= 48) && (keyCode <= 57)) // number keys
				|| ((keyCode >= 96) && (keyCode <= 105))) // numeric keypad
				return false;
			for (var i=0; i<validKeys.length; i++) // predefined list of special keys
				if (validKeys[i] == keyCode) return false;
			return true;
		}
		
		function setHoverDelay(callback) {
			if (hoverDelay) {
				if (callback == hoverDelayCallback) return;
				clearInterval(hoverDelay);
			}
			hoverDelayCallback = callback;
			hoverDelay = setInterval(execute, 100);
			
			function execute() {
				clearInterval(hoverDelay);
				hoverDelay = null;
				callback();
			}
		}
		
		function hoverIn() {
			setHoverDelay(function() {
				hovered = true;
				if (!focused || (showOn == 'hover')) // ignore focus flag if show on hover only
					self.showButtons();
			});
		}
		
		function hoverOut() {
			setHoverDelay(function() {
				hovered = false;
				if (!focused || (showOn == 'hover')) // ignore focus flag if show on hover only
					self.hideButtons();
			});
		}

		function focus() {
			msie ? selectAll() : setTimeout(selectAll, 0); // add delay for Chrome, but breaks IE8
			focused = true;
			focusCtrl = self;
			if (!hovered && (showOn == 'focus' || showOn == 'both')) // hovered will only be set if hover affects show
				self.showButtons();
		}
		
		function blur() {
			focused = false;
			if (!hovered && (showOn == 'focus' || showOn == 'both')) // hovered will only be set if hover affects show
				self.hideButtons();
		}
		
		function dblClick() { // fixes dbl click mouse event handling issues in IE
			if (!options.disabled) {
				self._change(); // make sure any changes are posted
				self._doSpin(this === upButton.get(0) ? 1 : -1);
			}
			
			return false;
		}

		function mouseDown() {
			if (!options.disabled) {
				self._change(); // make sure any changes are posted
				
				var input = self.element.get(0), dir = this === upButton.get(0) ? 1 : -1;
				input.focus();
				input.select();

				$(this).addClass(active);
				self.element.focus();
				self._doSpin(dir);
				self.spinCount = 1;
				self.inSpinTwo = false;
				inMouseDown = true;
				self._setTimer(self._spin, options.spinDelayOne, dir);
			}

			return false;
		}
		
		function mouseUp() {
			if (inMouseDown) {
				$(this).removeClass(active);
				self._clearTimer();
				inMouseDown = false;
			}
			return false;
		}
		
		function mouseWheel(e) { // only bound if options.mousewheel is true
			if (focused && (focusCtrl === self) && !options.disabled) {
				self._change(); // make sure changes are posted
				self._doSpin((e.wheelDelta || -e.detail) > 0 ? 1 : -1);
				return false;
			}
		}
		
		function hoverButtonIn() {
			if (!self._getData('disabled'))
				$(this).addClass(hover);
		}
	
		function hoverButtonOut() {
			if (!self._getData('disabled'))
				$(this).removeClass(hover);
		}
	},
	
	_spin: function(dir, large) {
		if (dir > 0)
			this.step(large);
		else
			this.decrement(large);
		this.spinCount++;
		
		if (!this.inSpinTwo) {
			var spinsBeforeDelayTwo = this._getData('spinsBeforeDelayTwo');
			if (spinsBeforeDelayTwo && this.spinCount > spinsBeforeDelayTwo) {
				this.inSpinTwo = true;
				this._setTimer(this._spin, this._getData('spinDelayTwo'), dir, large);
			}
		}
	},
	
	_setTimer: function(callback, delay) {
		var args = Array.prototype.slice.call(arguments, 2),
			instance = this;
		instance._clearTimer();
		instance.timer = setInterval(fire, delay);
		
		function fire() {
			callback.apply(instance, args);
		}
	},
	
	_clearTimer: function() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	},
	
	_doSpin: function(dir, large) {
		var self = this, // shortcut
			newValue,
			options = self.options,
			value = self.value,
			min = options.min,
			max = options.max,
			step = (large ? options.largeStep : options.step) * dir;

		if (value == null)
			newValue = (dir > 0 ? min || max : max || min) || 0;
		else
			newValue = value + step;
		if ((max != null) && (newValue > max))
			newValue = max;
		else if ((min != null) && (newValue < min))
			newValue = min;
		
		if (newValue != value) {
			self.value = newValue;
			self.element.val(newValue).change();
		}
		
		return false;
	},
	
	step: function(large) {
		return this._doSpin(1, large);
	},
	
	decrement: function(large) {
		return this._doSpin(-1, large);
	},
	
	showButtons: function(immediate) {
		var btnContainer = this.btnContainer.stop();
		if (immediate)
			btnContainer.css('opacity', 1);
		else
			btnContainer.fadeTo('fast', 1);
	},
	
	hideButtons: function(immediate) {
		var btnContainer = this.btnContainer.stop();
		if (immediate)
			btnContainer.css('opacity', 0);
		else
			btnContainer.fadeTo('fast', 0);
		this.buttons.removeClass('ui-state-hover');
	},
	
	/* Set the value directly. */
	setValue: function(value) {
		this.value = value;
		this._fixLength(value);
		this.element.val(value != null ? value: '').change();
	},

	/* Retrieve the value directly. */
	getValue: function() {
		return this.value;
	},

	/* Parse the value currently in the field */
	_parseValue: function() {
		var value = this.element.val();
		return value ? parseInt(value) : null;
	},
	
	_change: function(startup) {
		var self = this, // shortcut
			value = self._parseValue(),
			min = self._getData('min'),
			max = self._getData('max');
		
		if ((value == null) && !self._getData('allowNull'))
			value = self.value != null ? self.value : min || max; // must confirm not null in case just initializing and had blank value

		if (isNaN(value) ||
			((min != null) && (value < min)) ||
			((max != null) && (value > max)))
			value = self.value;

		self.element.val(value != null ? value : "");
		self.value = value;
		if (!startup) self.element.focus();
	},
	
	enable: function() {
		this.buttons.removeClass("ui-state-disabled");
		this.element.get(0).disabled = false;
		$.widget.prototype.enable.call(this);
	},
	
	disable: function() {
		this.buttons.addClass("ui-state-disabled");
		this.element.get(0).disabled = true;
		$.widget.prototype.disable.call(this);
	},
	
	destroy: function(target) {
		this.wrapper.after(this.element).remove();
		this.element.unbind(eventNamespace).css({ width: this._getData('oWidth'), marginRight: this._getData('oMargin') });
		$.widget.prototype.destroy.call(this);
	}	
});

$.extend($.ui.spinner, {
	version: "1.10",
	getter: "getValue",
	defaults: {
		min: null,
		max: null,
		defaultStep: 1, // real value is "step", and should be passed as such.  Use this value to detect if passed value should override HTML5 attribute
		largeStep: 10,
		className: null,
		showOn: 'always',
		width: 16,
		spinDelayOne: 500,
		spinDelayTwo: 100,
		spinsBeforeDelayTwo: 3,
		mouseWheel: true,
		allowNull: false
	}
});

})( jQuery );