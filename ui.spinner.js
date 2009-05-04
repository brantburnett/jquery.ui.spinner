(function($) {

$.widget("ui.spinner", {
	_init: function() {
		var self = this, // shortcut
			input = self.element,
			min = self._getData('min'),
			max = self._getData('max'),
			maxlength = input.get(0).maxLength,
			newLimit;
		
		if ((input.get(0).tagName != "INPUT") || (input.attr("type") != "text")) {
			console.error("Invalid target for ui.spinner");
			return;
		}
		
		// ensure that min is less than or equal to max
		if ((min != null) && (max != null) && min > max)
			self._setData('min', min = max);

		// fix min/max based on maxlength of the input
		if (maxlength) {
			newLimit = Math.pow(10, maxlength) - 1;
			if ((max == null) || (max > newLimit))
				self._setData('max', newLimit);
			newLimit = -(newLimit + 1) / 10 + 1;
			if ((min == null) || (min < newLimit))
				self._setData('min', newLimit);
		}		
		
		self._createButtons(input);
		self._change(); // process initial value

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
			msie = $.browser.msie;
			
		if (className) wrapper.addClass(className);
		
		wrapper.append(btnContainer.css({ height: height, left: -buttonWidth-rightMargin,
			// use offset calculation to fix vertical position in Firefox
			// add an extra pixel in IE
			top: (input.offset().top - wrapper.offset().top + ($.browser.msie ? 0 : 0)) + 'px' }));
		
		buttons = self.buttons = btnContainer.find('.ui-spinner-button');
		buttons.css({ width: buttonWidth - (box ? buttons.outerWidth() - buttons.width() : 0), height: height/2 - (box ? buttons.outerHeight() - buttons.height() : 0) });
		
		// fix icon centering
		icons = buttons.find('.ui-icon');
		icons.css({ marginLeft: (buttons.innerWidth() - icons.width()) / 2, marginTop:  (buttons.innerHeight() - icons.height()) / 2 });
		
		btnContainer.width(buttons.outerWidth());

		showOn = self._getData('showOn');
		if (showOn == 'focus' || showOn == 'both') // pop-up date picker when in the marked field
			input.focus(focus).blur(blur);
		if (showOn == 'hover' || showOn == 'both') {
			buttons.hover(hoverIn, hoverOut);
			input.hover(hoverIn, hoverOut);
		}
		if (showOn != 'always')
			btnContainer.css('opacity', 0);
		
		buttons.hover(hoverButtonIn, hoverButtonOut)
			.mousedown(mouseDown)
			.mouseup(mouseUp)
			.mouseout(mouseUp);
		if (msie)
			buttons.dblclick(dblClick) // fixes dbl click not firing mouse down
				.bind("selectstart", function() {return false;}); // select start fixes IE8 dbl click selection
		upButton = $(buttons.get(0));
		downButton = $(buttons.get(1));
		input.keydown(keyDown)
			.keyup(keyUp)
			.change(function() { self._change(); })
			.focus(function() { msie ? selectAll() : setTimeout(selectAll, 0); }); // add delay for Chrome, but breaks IE8
			
		function selectAll() { // in a function for compression
			self.element.select();
		}
		
		// events are declared in function so they have access to self variable and better minimization
		function keyDown(e) {
			var dir, large, limit;
			if (keyDir) return false; // only one direction at a time
			
			switch (e.keyCode) {
				case up:
				case pageUp:
					dir = 1;
					large = e.keyCode == pageUp;
					break;
					
				case down:
				case pageDown:
					dir = -1;
					large = e.keyCode == pageDown;
					break;
					
				case right:
				case left:
					dir = (e.keyCode == right) ^ rtl ? 1 : -1;
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
			
			if (dir) {
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
				if (!focused)
					self.showButtons();
			});
		}
		
		function hoverOut() {
			setHoverDelay(function() {
				hovered = false;
				if (!focused)
					self.hideButtons();
			});
		}

		function focus() {
			focused = true;
			if (!hovered)
				self.showButtons();
		}
		
		function blur() {
			focused = false;
			if (!hovered)
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
			this.increment(large);
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
		var newValue,
			options = this.options,
			value = this.value,
			min = options.min,
			max = options.max,
			increment = (large ? options.largeIncrement : options.increment) * dir;

		if (value == null)
			newValue = (dir > 0 ? min || max : max || min) || 0;
		else
			newValue = value + increment;
		if ((max != null) && (newValue > max))
			newValue = max;
		else if ((min != null) && (newValue < min))
			newValue = min;
		
		if (newValue != value) {
			this.value = newValue;
			this.element.val(newValue).change();
		}
		
		return false;
	},
	
	increment: function(large) {
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
	
	_change: function() {
		var value = this._parseValue(),
			min = this._getData('min'),
			max = this._getData('max');

		if (isNaN(value) ||
			((min != null) && (value < min)) ||
			((max != null) && (value > max)))
			value = this.value;

		this.element.val(value).get(0).focus();
		this.value = value;
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
		this.element.css({ width: this._getData('oWidth'), marginRight: this._getData('oMargin') });
		$.widget.prototype.destroy.call(this);
	}	
});

$.extend($.ui.spinner, {
	version: "1.01",
	getter: "getValue",
	defaults: {
		min: null,
		max: null,
		increment: 1,
		largeIncrement: 10,
		className: null,
		showOn: 'always',
		width: 16,
		spinDelayOne: 500,
		spinDelayTwo: 100,
		spinsBeforeDelayTwo: 3
	}
});

})( jQuery );