/* ***** BEGIN LICENSE BLOCK *****
 *
 * @COPYRIGHT@
 *
 * This file is part of the Adaptable XML Editing Library (AXEL), version @VERSION@ 
 *
 * @LICENSE@
 *
 * Web site : http://media.epfl.ch/Templates/
 * 
 * Author(s) : Stephane Sire
 * 
 * ***** END LICENSE BLOCK ***** */

/**
 * Basic XML loading algorithm exposed as a loadData function
 * Starts iterating on any XTiger XML DOM tree which must have been transformed first 
 * Feed the tree with XML data stored in a DOMDataSource
 * You can share this class as it doesn't maintain state information between loadData calls
 */
xtiger.editor.RobustLoader = function () {
}

xtiger.editor.RobustLoader.prototype = {    
	
	WARN_REPEAT_COUNT : 250,
	
	/////////////////////
	// Debug utilities //
	/////////////////////
	
	_dumpStackPath : function (msg, stack, point) {
		// var path = '';
		// for (var i = 0; i < stack.length; i++) {
		// 	path = path + ' ' + this._dumpPointName(stack[i]);
		// }
		// window.console.log(msg + ' : ' + path + ' << ' + this._dumpPointName(point));
	},      
	
	_dumpPointName : function (p) {
		if (p) {      
			if (p instanceof Array) {
				return p[0].localName;
			} else {
				return '-1';
			}			
		} else {
			return 'null';
		}
	},

	_empile : function (stack, point) {               
		var path = this._dumpStackPath('Empile', stack, point);
		stack.push(point);                                                 
	},
	
	_replaceTop : function (stack, point) {
		var path = this._dumpStackPath('Remplace', stack, point);
		stack[ stack.length - 1 ] = point;   
	},
	
	_depile : function (stack) {
			var top = stack.pop();
			var path = this._dumpStackPath('Depile', stack, top);
			return stack[stack.length -1];
	},
	
	//////////////////
	// Core methods //
	//////////////////
		
	// Walks through the tree and renders model data as it encounters it
	loadData : function (n, dataSrc) {
		// xtiger.cross.log('debug', 'Robust loader loading data');
		var curSrc = dataSrc.getRootVector ();
		var stack = [ curSrc ];
		this.loadDataIter (n, dataSrc, stack);
	},   
	
	makeRepeatState : function (repeater, size, useStack, useReminder) {
		return [repeater, size, useStack, useReminder];		
	},      
		
	loadDataSlice : function (begin, end, dataSrc, stack, point, origin, repeatedRepeater) {
		var repeats = []; // stack to track repeats
		var cur = begin;
		var go = true;
		var next; // anticipation (in case repeatExtraData is called while iterating as it insert siblings)
		var tmpStack, pos, begin, end;
		while (cur && go) {								
			if (cur.startRepeatedItem && (cur.startRepeatedItem != repeatedRepeater)) {
				if ((repeats.length == 0) || ((repeats[repeats.length - 1][0]) != cur.startRepeatedItem)) { // new repeat					
					var state;
					// cur.startRepeatedItem.reset(); // resets repeat (no data) => cannot alter it while iterating !
					if (cur.startRepeatedItem.hasLabel()) {
						var nextPoint = dataSrc.getVectorFor (cur.startRepeatedItem.dump(), point);
						if ((nextPoint instanceof Array) && (dataSrc.lengthFor(nextPoint) > 0)) { // XML data available
							this._empile(stack, nextPoint);
							point = nextPoint;
							state = this.makeRepeatState(cur.startRepeatedItem, cur.startRepeatedItem.getSize(), true, true);
						}	else { // No XML data available
							cur = cur.startRepeatedItem.getLastNodeForSlice(cur.startRepeatedItem.getSize()); // skips repeat
							cur = cur.nextSibling; // in case cur has children, no need to traverse them as no slice is selected
							continue
						}
					} else { 
						if (this.repeatWouldLDS (cur.startRepeatedItem, dataSrc, point)) { //  XML data available
							state = this.makeRepeatState(cur.startRepeatedItem, cur.startRepeatedItem.getSize(), false, true);
						} else {                                         
							cur = cur.startRepeatedItem.getLastNodeForSlice(cur.startRepeatedItem.getSize()); // skips repeat
							cur = cur.nextSibling;  // in case cur has children, no need to traverse them as no slice is selected
							continue
						}  
					}
					repeats.push(state);
				}
			}
			
			// restricts iterations on the current chosen item (if it is in the point)
			if (cur.beginChoiceItem && (cur.beginChoiceItem != origin)) {
				var c = cur.beginChoiceItem;
				point = dataSrc.getVectorForAnyOf (c.getTypes(), point);	
				if (point instanceof Array) { // implies (point != -1)
					this._empile(stack, point);
					var curItem = c.selectChoiceForName (dataSrc.nameFor(point));
					if (c.items[curItem][0] != c.items[curItem][1]) {
						this.loadDataSlice(c.items[curItem][0], c.items[curItem][1], dataSrc, stack, point, c); // [SLICE ENTRY]
						cur = c.items[c.items.length - 1][1]; // jumps to the last Choice item end boundary
						// in case it closes a label containing the choice, closes it 
						if ((cur.xttCloseLabel && (! cur.xttOpenLabel)) && (curItem != (c.items.length - 1))) {
							// this.loadDataIter (cur, dataSrc, stack); // the last Choice element may close a label
							point = this._depile(stack);
						}	                           							
					} else {					
						// a choice slice starts and end on the same node
						this.loadDataIter(c.items[curItem][0], dataSrc, stack);  // [SLICE ENTRY]						 
						point = this._depile(stack); // restores the stack and the point  [SLICE EXIT]
						cur = c.items[c.items.length - 1][1]; // jumps to the last Choice item end boundary						
					}
				} // otherwise do not change Choice content (no data)
			} else {
				// FIXME: see serializeDataIter
				this.loadDataIter (cur, dataSrc, stack); // FIXME: first interpretation
				point = stack[stack.length -1];
				if (origin) {  // checks if iterating on the current slice of a choice
					if (cur == origin.items[origin.curItem][1]) { // checks that the end of the slice/choice has been reached						
						point = this._depile(stack); // restores the stack and the point											
						return;  // [SLICE EXIT] ~ internal repeats are closed by callee (because repeat is handled 1st)
										 // there may also be a label associated with the last Choice element that will be closed by callee
					}					
				}
				// FIXME: second interpretation
				// this.loadDataIter (cur, dataSrc, stack);
				// point = stack[stack.length -1]; // recovers the point as loadDataIter may change the position in the stack
			}				
			if (cur == end) {
				go = false;
			}								
			next = cur.nextSibling;
			
			// checks repeat section closing i.e. the last item has been traversed
			if (cur.endRepeatedItem && (cur.endRepeatedItem != repeatedRepeater)) { 
				var state = repeats[repeats.length - 1]; // current repeat state
				// we consider that two repeat cannot end on the same node (and we assume cur.endRepeatedItem == state[0])
				--(state[1]);  
				if (state[1] < 0) { // optional repeater (total = 0) was set during this iteration 
					if (cur.endRepeatedItem.getSize() == 0) {
						cur.endRepeatedItem.sliceLoaded();
					}
					// otherwise it has been configured/activated through autoSelectRepeatIter call
					// from a service filter set to askUpdate on load
				}
				if (state[1] <= 0) { // all the items have been repeated (worth if min > 1)
					if (state[3]) { // have to check if the data source has been exhausted by the repetition
						var nb = 0;                                        
						var repeater = cur.endRepeatedItem;
						while (this.repeatWouldLDS (repeater, dataSrc, point)) {
							if (++nb > this.WARN_REPEAT_COUNT) {
								var terminate = confirm('Too many repetitions, data seems corrupted, abort ?');
								if (terminate)	break;
							}
							tmpStack = [point]; // simulates stack for handling the repeated repeat
							pos = repeater.appendSlice();
							begin = repeater.getFirstNodeForSlice(pos);
							end = repeater.getLastNodeForSlice(pos);
							this.loadDataSlice (begin, end, dataSrc, tmpStack, point, undefined, repeater);		
							repeater.sliceLoaded(); // 1 slice of extra data added to repeater during this iteration	 
					 	}
					}
					if (state[2]) {
						point = this._depile(stack); // restores stack and point
					}                      
					repeats.pop();		
				}
			}			
			cur = next;
		}		
	},
		
	// Manages xttOpenLabel, xttCloseLabel and atomic primitive editors
	// Recursively call loadDataSlice on the children of the node n	
	loadDataIter : function (n, dataSrc, stack) {
		var curFlow, curLabel;
		var point = stack[ stack.length - 1 ];
		if (n.xttOpenLabel) {     
			curLabel = n.xttOpenLabel;
			if (curLabel.charAt(0) == '!') { // double coding "!flow!label" to open a separate flow
				var m = curLabel.match(/^!(.*?)!(.*)$/); // FIXME: use substr...
				curFlow = m[1];
				curLabel = m[2];
				// window.console.log('Open Flow ' + curFlow + ' at point ' +  dataSrc.nameFor(point));
				point = dataSrc.openFlow(curFlow, point, curLabel) || point; // changes the point to the separate flow
				// FIXME: what to do if no flow, theoritically it is possible to ignore it 
				// then we should also ignore it in closeFlow (that means data aggregation was done server side)
			}
			var attr = false;
			// moves inside data source tree
			if (curLabel.charAt(0) == '@') {          
				point = dataSrc.getAttributeFor(curLabel.substr(1, curLabel.length - 1), point);
				attr = true;
			} else {
				point = dataSrc.getVectorFor(curLabel, point);
			}
			if (attr || ((point instanceof Array) && (dataSrc.lengthFor(point) > 0))) {
				this._empile(stack, point);
			} else {
				// FIXME: handle optional element it (make them turned off)
				point = -1; // -1 for "End of Source Data" (xttCloseLabel should be on a sibling)
				this._empile(stack, point);				
			}
		}
		if (n.xttPrimitiveEditor) {
			n.xttPrimitiveEditor.load (point, dataSrc);
			point = -1; // to prevent iteration on children of n below as n should be atomic
		}
		if (n.firstChild) {
				// FIXME: iterates on child even if point -1 to be robust to incomplete XML (not sure this is exactly required)
				this.loadDataSlice (n.firstChild, n.lastChild, dataSrc, stack, point);
		}
		if (n.xttCloseLabel) { 
			curLabel = n.xttCloseLabel;
			if (curLabel.charAt(0) == '!') { // double coding "!flow!label" to open a separate flow
				var m = curLabel.match(/^!(.*?)!(.*)$/); // FIXME: use substr...
				curFlow = m[1];
				curLabel = m[2];
				dataSrc.closeFlow(curFlow, point); // restores point to the previous flow (or top)
			}
			this._depile(stack);		 
		}			                           				
	},            
	  
	// Entry point
	repeatWouldLDS : function (repeater, dataSrc, point) {
		var tmpStack = [point]; // simulates stack while validating repeat slice consumes data source hypothesis
		// var begin = cur.startRepeatedItem.model.firstChild;
		// var end = cur.startRepeatedItem.model.lastChild;   
		var begin = repeater.getFirstNodeForSlice(0);
		var end = repeater.getLastNodeForSlice(0);
		// uses slice 0 as a sample (and not the repeater.model that contains seeds instead of refs to repeater)
		return this.wouldLoadDataSlice (begin, end, dataSrc, tmpStack, point, undefined, repeater);		
	},	
	      
	// Returns true if the slice given as parameter would consume some data from the stack / point
	// Does not consume it actually
	wouldLoadDataSlice : function (begin, end, dataSrc, stack, point, origin, repeatedRepeater) {
		var repeats = []; // stack to track repeats
		var cur = begin;
		var go = true;
		var next; // anticipation (in case repeatExtraData is called while iterating as it insert siblings)
		while (cur && go) {								
			if (cur.startRepeatedItem && (cur.startRepeatedItem != repeatedRepeater)) {
				if ((repeats.length == 0) || ((repeats[repeats.length - 1][0]) != cur.startRepeatedItem)) { // new repeat					
					var state;
					if (cur.startRepeatedItem.hasLabel()) {
						if (dataSrc.hasVectorFor (cur.startRepeatedItem.dump(), point)) {
							return true;
						}	else {
							cur = cur.startRepeatedItem.getLastNodeForSlice(cur.startRepeatedItem.getSize()); // skips repeat
							cur = cur.nextSibling; // in case cur has children, no need to traverse them as no slice is selected
							continue
						}
					} else {                      
						if (this.repeatWouldLDS (cur.startRepeatedItem, dataSrc, point)) { 
							return true;
						} else {                                         
							cur = cur.startRepeatedItem.getLastNodeForSlice(cur.startRepeatedItem.getSize()); // skips repeat
							cur = cur.nextSibling;  // in case cur has children, no need to traverse them as no slice is selected
							continue
						}  
					}
					repeats.push(state);
				}
			}
			
			// restricts iterations on the current chosen item (if it is in the point)
			if (cur.beginChoiceItem && (cur.beginChoiceItem != origin)) {
				var c = cur.beginChoiceItem;
				if (dataSrc.hasVectorForAnyOf (c.getTypes(), point)) {
					return true;
				}
			} else {
				if (this.wouldLoadDataIter (cur, dataSrc, stack)) {
					return true;
				}
				point = stack[stack.length -1];
			}				
			if (cur == end) {
				go = false;
			}								
			next = cur.nextSibling;
			
			// checks repeat section closing i.e. the last item has been traversed
			// FIXME: two repeats may end on the same node (& eventually begin) : endRepeatedItem and startRepeatedItem should be some vectors ?
			if (cur.endRepeatedItem && (cur.endRepeatedItem != repeatedRepeater)) { 
				var state = repeats[repeats.length - 1]; // current repeat state
				if (true || (cur.endRepeatedItem == state[0])) {   // true: at the moment always 1 repeat end by node					
					--(state[1]);  
					if (state[1] <= 0) { // all the items have been repeated (worth if min > 1)
						repeats.pop();		
					}
				}
			}			
			cur = next;
		}		
	},

  // see above
	wouldLoadDataIter : function (n, dataSrc, stack) {
		var curFlow, curLabel;
		var point = stack[ stack.length - 1 ];
		if (n.xttOpenLabel) {     
			curLabel = n.xttOpenLabel;
			if (curLabel.charAt(0) == '!') { // double coding "!flow!label" to open a separate flow
				var m = curLabel.match(/^!(.*?)!(.*)$/); // FIXME: use substr...
				curFlow = m[1];
				curLabel = m[2];
				// window.console.log('Open Flow ' + curFlow + ' at point ' +  dataSrc.nameFor(point));
				point = dataSrc.openFlow(curFlow, point, curLabel) || point; // changes the point to the separate flow
				// FIXME: what to do if no flow, theoritically it is possible to ignore it 
				// then we should also ignore it in closeFlow (that means data aggregation was done server side)
			}
			var attr = false;
			if (curLabel.charAt(0) == '@') {          
				attr = true;
				if (dataSrc.hasAttributeFor(curLabel.substr(1, curLabel.length - 1), point)) {
					return true;
				}				
			} else {    
				// if (curLabel == 'N') {
				// 	debugger;
				// }
				if (dataSrc.hasVectorFor(curLabel, point)) {
					return true;
				} else {
					point = -1;
				}
			}
			if (attr || ((point instanceof Array) && (dataSrc.lengthFor(point) > 0))) {
				this._empile(stack, point);
			} else {
				point = -1; // -1 for "End of Source Data" (xttCloseLabel should be on a sibling)
				this._empile(stack, point);				
			}
		}
		if (n.xttPrimitiveEditor) {
			point = -1; // to prevent iteration on children of n below as n should be atomic
		}
		if (n.firstChild) {
				// FIXME: iterates on child even if point -1 to be robust to incomplete XML (not sure this is exactly required)
				if (this.wouldLoadDataSlice (n.firstChild, n.lastChild, dataSrc, stack, point)) {
					return true;
				}
		}
		if (n.xttCloseLabel) { 
			curLabel = n.xttCloseLabel;
			if (curLabel.charAt(0) == '!') { // double coding "!flow!label" to open a separate flow
				var m = curLabel.match(/^!(.*?)!(.*)$/); // FIXME: use substr...
				curFlow = m[1];
				curLabel = m[2];
				dataSrc.closeFlow(curFlow, point); // restores point to the previous flow (or top)
			} else {
				this._depile(stack);		 
			}
		}
		return false;
	}
	
	//////////////////////////////////
	// Previous draft algorithm ... //
	//////////////////////////////////
	
	// checks that all the repeated items have been consumed on the stack at the point
	// hasDataFor : function (repeater, point, dataSrc) {
	// 	var doMore = false;
	// 	if (repeater.hasLabel()) { // in that case repeater Tag was popped out
	// 		// doMore = (0 != dataSrc.lengthFor(point));    
	// 		var labels = [];
	// 		this.getFirstLabelsForSlice(repeater.getFirstNodeForSlice(0), repeater.getLastNodeForSlice(0), labels, repeater);
	// 		if (labels.length > 0) {
	// 			doMore = dataSrc.hasVectorForAnyOf(labels, point);
	// 			window.console.log('Checked (%s) labelled repeat with pseudo label %s', doMore, labels);
	// 		} else {
	// 			window.console.log('Checked (%s) labelled repeat with pseudo label %s', doMore, labels);
	// 			doMore = false; // FIXME : impossible case ?
	// 		}
	// 	} else { // in  that case nothing was popped out           
	// 		// if (! repeater.getRepeatableLabel()) {
	// 		// 	debugger; // FIXME: should we raise an error ? (Bad template)
	// 		// }                                   
	// 		doMore = dataSrc.hasVectorForAnyOf(repeater.getRepeatableLabel().split(' '), point);
	// 		// doMore = dataSrc.hasDataFor(repeater.getRepeatableLabel(), point);
	// 		window.console.log('Checked (%s) anonymous repeat with pseudo label %s', doMore, repeater.getRepeatableLabel());
	// 		// window.console.log('Checked (%s) anonymous repeat with pseudo label %s', doMore, repeater.getRepeatableLabel());
	// 	}
	// 	return doMore;
	// },	
	// Manage the Choice current slice
	// origin is optional, it is the Choice editor from where a recursive call has been initiated       
	
	// getFirstLabelsForSlice : function (begin, end, accu, repeatedRepeater) {
	// 	var found = false;
	// 	var optional = false; 
	// 	var goOn = true;
	// 	
	// 	var repeats = []; // stack to track repeats		
	// 	var cur = begin;
	// 	var go = true;
	// 	while (cur && go && goOn) {
	// 		
	// 		// manage repeats
	// 		if (cur.startRepeatedItem) {
	// 			if ((repeats.length == 0) || ((repeats[repeats.length - 1][0]) != cur.startRepeatedItem)) {
	// 				repeats.push ([optional, cur.startRepeatedItem.getSize()]);
	// 				if (cur.startRepeatedItem.min == 0) {
	// 					optional = true
	// 				}
	// 				if (cur.startRepeatedItem.hasLabel() && (cur.startRepeatedItem != repeatedRepeater)) {
	// 					var name = cur.startRepeatedItem.dump();
	// 					accu.push(name);
	// 					// xtiger.cross.log('debug', name);
	// 					if (! optional) { return false; }
	// 				}
	// 			} 				
	// 		}			
	// 		
	// 		if (cur.beginChoiceItem) {
	// 			var c = cur.beginChoiceItem;				
	// 			accu.push(c.getTypes());
	// 			// xtiger.cross.log('debug', c.getTypes().join(' '));
	// 			if (! optional) { return false; }
	// 			cur = c.items[c.items.length - 1][1]; // sets cur to the last choice
	// 		} else {
	// 			goOn = this.getFirstLabelsForPoint (cur, accu, optional, repeatedRepeater);
	// 		}			
	// 		
	// 		if (cur.endRepeatedItem) {
	// 			--(repeats[repeats.length - 1][1]);
	// 			if (repeats[repeats.length - 1][1] <= 0) { 
	// 				optional = repeats[repeats.length - 1][0];
	// 				repeats.pop();
	// 			}
	// 		}			
	// 		if (cur == end) {
	// 			go = false;
	// 		}
	// 		cur = cur.nextSibling;
	// 	}		 
	// 	return goOn;
	// },           	
	// 
	// getFirstLabelsForPoint : function (n, accu, optional, repeatedRepeater) { 
	// 	var found = false;
	// 	var goOn = true;
	// 	
	// 	var curFlow, curLabel;		   
	// 	if (n.xttOpenLabel) {            
	// 		curLabel = n.xttOpenLabel;
	// 		if (curLabel.charAt(0) == '!') { // double coding "!flow!label" to open a separate flow
	// 			var m = curLabel.match(/^!(.*?)!(.*)$/); // FIXME: use substr...
	// 			curFlow = m[1];
	// 			curLabel = m[2];
	// 		}
	// 		// if (curLabel.charAt(0) == '@') {
	// 		// } else {
	// 		// }     
	// 		accu.push(curLabel);
	// 		// xtiger.cross.log('debug', curLabel);
	// 		found = true;
	// 	}
	// 	if (n.xttPrimitiveEditor) {	                     
	// 		// xtiger.cross.log('debug', 'found primitive editor');
	// 		// nop - we are just interested in the tag hierarchy
	// 		if (n.xttPrimitiveEditor.isOptional) {
	// 			if ((typeof(n.xttPrimitiveEditor.isOptional) == "boolean") || 
	// 				((typeof(n.xttPrimitiveEditor.isOptional) == "function") && n.xttPrimitiveEditor.isOptional()))
	// 			{
	// 				// OPTIONAL 
	// 			} else {   
	// 				goOn = false; // stop (last label will be treated as mandatory and stop iterations)
	// 				// xtiger.cross.log('debug', 'goOn to false');
	// 			}
	// 		} else {
	// 			goOn = false; // stop (last label will be treated as mandatory and stop iterations)
	// 			// xtiger.cross.log('debug', 'goOn to false');
	// 		}
	// 	} else {
	// 		if (n.firstChild) {
	// 			// if (! found) { // DIVE INSIDE
	// 				goOn = this.getFirstLabelsForSlice(n.firstChild, n.lastChild, accu, repeatedRepeater);		
	// 			// }
	// 		}
	// 	}
	// 	// if (n.xttCloseLabel) {         
	// 	// }
	// 	return goOn;			                           		
	// }	
}

// Registers as default XML loader (file must be included after generator.js)
xtiger.editor.Generator.prototype.defaultLoader = new xtiger.editor.RobustLoader ();

