import { animate, AnimationEvent, state, style, transition, trigger } from '@angular/animations';
import { Component, ComponentRef, ElementRef, HostBinding, HostListener, NgZone, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { BasePortalHost, ComponentPortal, PortalHostDirective, TemplatePortal } from '@angular/material';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import { MdKeyboardConfig } from './keyboard.config';
import { MdKeyboardContentAlreadyAttached } from './keyboard.errors';


export type KeyboardState = 'initial' | 'visible' | 'complete' | 'void';

// TODO(jelbourn): we can't use constants from animation.ts here because you can't use
// a text interpolation in anything that is analyzed statically with ngc (for AoT compile).
export const SHOW_ANIMATION = '225ms cubic-bezier(0.4,0.0,1,1)';
export const HIDE_ANIMATION = '195ms cubic-bezier(0.0,0.0,0.2,1)';

/**
 * Internal component that wraps user-provided snack bar content.
 * @docs-private
 */
@Component({
  selector: 'md-keyboard-container',
  templateUrl: './keyboard-container.component.html',
  styleUrls: ['./keyboard-container.component.scss'],
  host: {
    'role': 'alert',
    '[@state]': 'animationState',
    '(@state.done)': 'onAnimationEnd($event)'
  },
  animations: [
    trigger('state', [
      state('initial', style({ transform: 'translateY(100%)' })),
      state('visible', style({ transform: 'translateY(0%)' })),
      state('complete', style({ transform: 'translateY(100%)' })),
      transition('visible => complete', animate(HIDE_ANIMATION)),
      transition('initial => visible, void => visible', animate(SHOW_ANIMATION)),
    ])
  ],
})
export class MdKeyboardContainerComponent extends BasePortalHost implements OnDestroy {

  @HostBinding('attr.role') attrRole = 'alert';

  @HostBinding('@state') animState = 'alert';


  /** The portal host inside of this container into which the snack bar content will be loaded. */
  @ViewChild(PortalHostDirective) _portalHost: PortalHostDirective;

  /** Subject for notifying that the snack bar has exited from view. */
  private onExit: Subject<any> = new Subject();

  /** Subject for notifying that the snack bar has finished entering the view. */
  private onEnter: Subject<any> = new Subject();

  /** The state of the snack bar animations. */
  @HostBinding('@state')
  animationState: KeyboardState = 'initial';

  /** The snack bar configuration. */
  keyboardConfig: MdKeyboardConfig;

  constructor(private _ngZone: NgZone,
              private _renderer: Renderer2,
              private _elementRef: ElementRef) {
    super();
  }

  /** Attach a component portal as content to this snack bar container. */
  attachComponentPortal<T>(portal: ComponentPortal<T>): ComponentRef<T> {
    if (this._portalHost.hasAttached()) {
      throw new MdKeyboardContentAlreadyAttached();
    }

    if (this.keyboardConfig.extraClasses) {
      // Not the most efficient way of adding classes, but the renderer doesn't allow us
      // to pass in an array or a space-separated list.
      for (let cssClass of this.keyboardConfig.extraClasses) {
        this._renderer.addClass(this._elementRef.nativeElement, cssClass);
      }
    }

    return this._portalHost.attachComponentPortal(portal);
  }

  /** Attach a template portal as content to this snack bar container. */
  attachTemplatePortal(portal: TemplatePortal): Map<string, any> {
    throw Error('Not yet implemented');
  }

  /** Handle end of animations, updating the state of the keyboard. */
  @HostListener('@state.done', ['$event'])
  onAnimationEnd(event: AnimationEvent) {
    if (event.toState === 'void' || event.toState === 'complete') {
      this._completeExit();
    }

    if (event.toState === 'visible') {
      // Note: we shouldn't use `this` inside the zone callback,
      // because it can cause a memory leak.
      const onEnter = this.onEnter;

      this._ngZone.run(() => {
        onEnter.next();
        onEnter.complete();
      });
    }
  }

  /** Begin animation of snack bar entrance into view. */
  enter(): void {
    this.animationState = 'visible';
  }

  /** Returns an observable resolving when the enter animation completes.  */
  _onEnter(): Observable<void> {
    this.animationState = 'visible';
    return this.onEnter.asObservable();
  }

  /** Begin animation of the snack bar exiting from view. */
  exit(): Observable<void> {
    this.animationState = 'complete';
    return this._onExit();
  }

  /** Returns an observable that completes after the closing animation is done. */
  _onExit(): Observable<void> {
    return this.onExit.asObservable();
  }

  /**
   * Makes sure the exit callbacks have been invoked when the element is destroyed.
   */
  ngOnDestroy() {
    this._completeExit();
  }

  /**
   * Waits for the zone to settle before removing the element. Helps prevent
   * errors where we end up removing an element which is in the middle of an animation.
   */
  private _completeExit() {
    // Note: we shouldn't use `this` inside the zone callback,
    // because it can cause a memory leak.
    const onExit = this.onExit;

    this._ngZone.onMicrotaskEmpty.first().subscribe(() => {
      onExit.next();
      onExit.complete();
    });
  }
}