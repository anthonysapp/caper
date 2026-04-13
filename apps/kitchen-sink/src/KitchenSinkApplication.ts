import { Application, PopupId } from '@caper/core';
import { IFirebasePlugin } from '@caper/plugin-firebase';
import { IGoogleAnalyticsPlugin } from '@caper/plugin-google-analytics/GoogleAnalyticsPlugin';
import { AnalyticsEvents } from 'caper.config';

export class KitchenSinkApplication extends Application {
  get firebase(): IFirebasePlugin {
    return this.getPlugin('firebase') as unknown as IFirebasePlugin;
  }

  get analytics(): IGoogleAnalyticsPlugin<AnalyticsEvents> {
    return this.getPlugin('google-analytics') as unknown as IGoogleAnalyticsPlugin<AnalyticsEvents>;
  }

  setup() {
    this.actions('toggle_pause').connect((detail) => this.togglePause(detail.data), 'highest');
    this.actions('show_popup').connect((detail) => this.popups.showPopup(detail.data.id as PopupId, detail.data));
  }
}
