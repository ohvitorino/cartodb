  cdb.admin.SelectAssetPane = cdb.admin.ImportPane.extend({

    initialize: function() {
      cdb.admin.ImportPane.prototype.initialize.call(this);

      this.template = this.options.template || cdb.templates.getTemplate('table/views/asset_manager/select_asset_pane');
      this.collection = new cdb.admin.Assets([], { user: this.options.user });

      this._initBinds();
      this.render();

      this.fetchCollection();
    },

    render: function() {
      cdb.admin.ImportPane.prototype.render.call(this);

      // Generate assets list
      var assets_list = new cdb.admin.AssetsList({
        collection: this.collection,
        kind: this.options.kind
      });

      // Append content
      this.$('.assets-list').append(assets_list.render().el);
      this.addView(assets_list);

      return this;
    },

    _initBinds: function() {
      this.collection.bind('add remove reset',  this._onAssetsChange, this);
      this.collection.bind('change',            this._onAssetChange,  this)
    },

    // Bind changes when assets collection change
    _onAssetsChange: function() {
      if (this.collection.size() > 0) {
        this.$('div.assets-list').show();
        this.$('div.assets').css('marginBottom', '30px');
        // this._selectLastAsset();
      } else {
        this.$('div.assets-list').hide();
        this.$('div.assets').css('marginBottom', 0);
      }

      this.$('div.assets div.loader').hide();
    },

    _selectLastAsset: function() {
      var last_kind_asset;

      this.collection.each(function(asset) {
        if (asset.get('state') == "selected") {
          asset.set('state', 'idle');
        }
        if (asset.get('kind') == this.kind) {
          last_kind_asset = asset;
        }
      }, this);

      if (last_kind_asset) last_kind_asset.set('state', 'selected');
    },

    // Bind when an asset is selected or not
    _onAssetChange: function() {
      // Check if any asset is selected
      var selected_asset = this._getSelectedAsset();
      if (selected_asset && selected_asset.get('public_url')) {
        var value = selected_asset.get('public_url');
        this.model.set({
          value:  value,
          type:   'url'
        });
        this.trigger('valueChange', this.model.toJSON(), this);
      }
    },

    // Checks if an asset is selected
    _getSelectedAsset: function() {
      return this.collection.find(function(m) {
        return m.get('state') == 'selected';
      });
    },

    fetchCollection: function() {
      this.collection.fetch();
    }

  });