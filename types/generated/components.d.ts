import type { Schema, Struct } from '@strapi/strapi';

export interface SchoolHomeFeature extends Struct.ComponentSchema {
  collectionName: 'components_school_home_features';
  info: {
    displayName: 'Home showcase feature';
    icon: 'grid';
  };
  attributes: {
    icon: Schema.Attribute.String & Schema.Attribute.DefaultTo<'\u2B50'>;
    text: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'school.home-feature': SchoolHomeFeature;
    }
  }
}
