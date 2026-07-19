import { beforeEach, describe, expect, it } from 'vitest';
import { ConversionFormComponent } from './conversionFormComponent';

describe('ConversionFormComponent', () => {
    let container: HTMLElement;
    let messageContainer: HTMLElement;
    let component: ConversionFormComponent;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        messageContainer = document.createElement('div');
        document.body.append(container, messageContainer);
        component = new ConversionFormComponent({ container, messageContainer });
    });

    it('renders format, quality and toggle options', () => {
        expect(container.querySelector('#target-format')).not.toBeNull();
        expect(container.querySelector('#conversion-quality')).not.toBeNull();
        expect(container.querySelector('#reverse-video')).not.toBeNull();
        expect(container.querySelector('#remove-sound')).not.toBeNull();
    });

    it('returns the default options (MOV, default quality, sound removed)', () => {
        expect(component.getConversionOptions()).toEqual({
            targetFormat: 'mov',
            quality: 'default',
            reverseVideo: false,
            removeSound: true,
        });
    });

    it('reflects user changes in the returned options', () => {
        (container.querySelector('#target-format') as HTMLSelectElement).value = 'mp4';
        (container.querySelector('#conversion-quality') as HTMLSelectElement).value = 'high';
        (container.querySelector('#reverse-video') as HTMLInputElement).checked = true;
        (container.querySelector('#remove-sound') as HTMLInputElement).checked = false;

        expect(component.getConversionOptions()).toEqual({
            targetFormat: 'mp4',
            quality: 'high',
            reverseVideo: true,
            removeSound: false,
        });
    });
});
