
  /**
   *  Asset manager to select & upload icons or patterns...
   *
   *  - It creates a model to manage the states of the dialog ('idle' or 'uploading')
   *  - It creates a assets collection to manage images.
   *  - It needs the user data, to get the id and use it in the collection.
   *
   *  new cdb.admin.AssetManager({
   *    user: user_data
   *  });
   *
   */


  cdb.admin.AssetManager = cdb.admin.BaseDialog.extend({

    _TEXTS: {
      title:        _t('Select a {marker_kind} image'),
      ok: {
        upload:     _t('Upload image'),
        set:        _t('Set image')
      },
      upload: {
        error:      _t('There was a problem with the upload, please try it again.'),
        url_error:  _t('The url provided was not valid, please try another one.')
      }
    },

    _UPLOADER: {
      url:              '/api/v1/users/<%= id %>/assets',
      uploads:          1,                                  // Max uploads at the same time
      maxFileSize:      1048576,                            // 1MB
      acceptFileTypes:  ['png','svg','jpeg','jpg'],
      acceptSync:       undefined
    },

    events: function(){
      return _.extend({},cdb.admin.BaseDialog.prototype.events,{ });
    },

    initialize: function() {
      _.bindAll(this, "_onUploadStart", "_onUploadAbort",
      "_onUploadAdd", "_onUploadComplete", "_onUploadError");

      this.model = new cdb.core.Model({
        state:  'idle',
        value:  '',
        type:   ''
      });
      
      this.model.bind('change', this._checkOKButton, this);
      
      this.user = this.options.user;
      this.kind = this.options.kind;
      
      if (!this.kind) {
        throw new Error('kind should be passed');
      }

      _.extend(this.options, {
        title: i18n.format(this._TEXTS.title, { marker_kind: this.kind }),
        description: '',
        template_name: 'common/views/dialog_base',
        clean_on_hide: true,
        ok_button_classes: "button grey disabled",
        cancel_button_classes: "hide",
        ok_title: this._TEXTS.ok.set,
        modal_type: "creation asset_manager",
        width: 600
      });

      this.constructor.__super__.initialize.apply(this);
    },

    ////////////
    // RENDER //
    ////////////

    render_content: function() {
      var $content = this.$content = $("<div>");
      this.temp_content = this.getTemplate('table/views/asset_manager/asset_manager');
      $content.append(this.temp_content());

      // Render tab panes
      this.render_upload_tabs($content);

      // Init uploader
      this._init_uploader($content);

      return $content;
    },

    render_upload_tabs: function($content) {
      // Upload tabs
      this.upload_tabs = new cdb.admin.Tabs({
        el: $content.find('.upload-tabs'),
        slash: true
      });
      this.addView(this.upload_tabs);

      // Create TabPane
      this.upload_panes = new cdb.ui.common.TabPane({
        el: $content.find(".upload-panes")
      });

      this.upload_panes.bind('tabEnabled', this._setModel, this);
      this.addView(this.upload_panes);
      this.upload_tabs.linkToPanel(this.upload_panes);

      // Render assets pane
      this._renderAssetsPane($content);

      // Render file pane
      this._renderFilePane($content);

      // Render dropbox pane
      this._renderDropboxPane($content);

      $content.append(this.upload_panes.render());
      this.upload_panes.active('assets');
    },

    _renderAssetsPane: function() {
      this.assetsPane = new cdb.admin.SelectAssetPane({
        user: this.user,
        kind: this.kind
      });
      this.assetsPane.bind('valueChange', this._onValueChange, this);
      this.upload_panes.addTab('assets', this.assetsPane);
    },

    _renderFilePane: function() {
      this.filePane = new cdb.admin.ImportFilePane({
        template: cdb.templates.getTemplate('table/views/asset_manager/import_asset_file'),
        maxFileSize: this._UPLOADER.maxFileSize,
        maxUploadFiles: this._UPLOADER.uploads,
        acceptFileTypes: this._UPLOADER.acceptFileTypes,
        acceptSync: this._UPLOADER.acceptSync
      });
      this.filePane.bind('valueChange', this._onValueChange, this);
      this.upload_panes.addTab('file', this.filePane);
    },

    _renderDropboxPane: function($content) {
      if (cdb.config.get('dropbox_api_key')) {
        this.dropboxPane = new cdb.admin.ImportDropboxPane({
          template: cdb.templates.getTemplate('table/views/asset_manager/import_asset_dropbox'),
          acceptFileTypes: this._UPLOADER.acceptFileTypes,
          acceptSync: this._UPLOADER.acceptSync
        });
        this.dropboxPane.bind('valueChange', this._onValueChange, this);
        this.upload_panes.addTab('dropbox', this.dropboxPane);  
      } else {
        $content.find('a.dropbox').parent().remove();
      }
    },


    //////////////
    // UPLOADER //
    //////////////

    _init_uploader: function($content) {
      // Create all components vars
      this.$loader      = $content.find("div.upload-progress");
      this.$list        = $content.find("div.dialog-content");
      this.$import      = $content.find("div.upload");
      this.$error       = this.$("section.modal.error");
      this.$importation = this.$("section.modal:eq(0)");

      // Create the fileupload
      var $upload = this.$upload = $content.find("form.dialog-uploader");
      $upload.fileupload({
        // It is not possible to disable dropzone.
        // So, dropzone element doesn't exist, :)
        dropZone:               this.$('.non-dropzone'),
        url:                    _.template(this._UPLOADER.url)(this.user),
        paramName:              'filename',
        progressInterval:       100,
        bitrateInterval:        500,
        maxFileSize:            this._UPLOADER.maxFileSize,
        autoUpload:             true,
        limitMultiFileUploads:  this._UPLOADER.uploads,
        limitConcurrentUploads: this._UPLOADER.uploads,
        acceptFileTypes:        this._setValidFileExtensions(this._UPLOADER.acceptFileTypes),
        add:                    this._onUploadAdd,
        start:                  this._onUploadStart,
        done:                   this._onUploadComplete,
        fail:                   this._onUploadError,
        // set the type of the asset
        formData:               { kind: this.kind }
      });

      // Set uploader widget
      this.uploader = this.$upload.data('fileupload');

      return this.$content;
    },

    _setValidFileExtensions: function(list) {
      return RegExp("(\.|\/)(" + list.join('|') + ")$", "i");
    },

    _uploadData: function() {
      if (this.model.get('type') === "file") {
        this.$upload.fileupload('add', { files: this.model.get('value') });
      } else {
        this._uploadFromUrl();
      }
    },

    _uploadFromUrl: function() {
      // Validate file url if it comes from a service, like Dropbox.
      if (this.model.get('type') != 'url') {
        var file = { name: this.model.get('value') };
        // Validate this url file
        this.uploader._validate( [file] );
        
        if (file.error) {
          // Show error
          this._onUploadError(null, { files: [file] });
          return false;
        }
      }

      // Active file pane
      this.upload_panes.active('file');
      // Change the state of the ui
      this._changeState("uploading");
      // Change state of the dialog
      this.model.set('state', 'uploading');

      // upload via ajax
      // TODO: change this by a save on a model
      var self = this;
      $.ajax({
        type: "POST",
        url: _.template(this._UPLOADER.url)(this.user),
        data: { url: this.model.get('value'), kind: this.kind },
        success: function(r) {
          self._onUploadComplete();
        },
        error: function(e) {
          var file = { error: 'connection', name: this.model.get('value') };
          self._onUploadError(null, { files: [ file ] });
        }
      });
    },

      // When an upload starsts
    _onUploadStart: function(e, data) {
      this.model.set('state', 'uploading');
      this._changeState("uploading");
    },

    // If user cancels an upload
    _onUploadAbort: function(e) {
      this.model.set('state', 'idle');
      if (e) e.preventDefault();
      this.jqXHR.abort();
    },

    // Upload complete, YAY!
    _onUploadComplete: function() {
      this.model.set('state', 'idle');

      // Clean file pane and dropbox pane values
      // this.filePane.cleanInput();

      // Fetch collection
      this.assetsPane.fetchCollection();

      // Show assets pane
      this.upload_panes.active('assets');

      this._changeState("reset");
    },

    // When a file is added, start the upload
    _onUploadAdd: function(e, data) {
      if (data.originalFiles.length == 1) {
        this.jqXHR = data.submit();
      }
    },

    // On upload error
    _onUploadError: function(e, data) {
      this.model.set('state', 'idle');
      this._changeState("reset");

      if (this.filePane) {
        // Activate file tab
        this.upload_panes.active('file');

        // Connectivity error?
        if (data.errorThrown == "Bad Request") {
          data.files[0].error = 'connection';
        }

        // Abort error?
        if (data.errorThrown == "abort") {
          data.files[0].error = 'abort';
        }

        // Show error in file tab
        this.filePane._onUploadError(null, {
          files: data.files
        });        
      }
    },






    _setModel: function() {
      var values = this.upload_panes.activePane.getValues();
      this.model.set({
        value:  values.value,
        type:   values.type
      });
    },

    _onValueChange: function(obj) {
      this.model.set({
        value:  obj.value,
        type:   obj.type
      });

      // If value from any pane changes, check if it comes
      // from 'file' or 'dropbox' pane to automatically upload
      // the image file
      var tab = this.upload_panes.activeTab;
      if (tab !== "assets") {
        this._uploadData();
      }
    },







    //////////////////
    //  UI ACTIONS  //
    //////////////////

    // Check
    _checkOKButton: function() {
      // Changing ok button
      this.$("a.ok")
        [ ( !this.model.get('value') || this.model.get('state') == "uploading" )  ? 'addClass' : 'removeClass' ]('disabled')
        .text( this.upload_panes.activeTab == "assets" ? this._TEXTS.ok.set : this._TEXTS.ok.upload );
    },

    // Show loader
    _showLoader: function() {
      this.$loader.addClass("active");
    },

    // Hide loader
    _hideLoader: function() {
      this.$loader.removeClass("active creating uploading");
    },

    // Change ui state
    _changeState: function(mode) {
      var actions = cdb.admin.upload_asset_states[mode];

      // Hide close?
      this.$importation.find("a.close").stop()[actions.hideClose ? "fadeOut" : "fadeIn"]();

      // List animation
      this.$list.stop().animate(actions.list.animate.properties,actions.list.animate.options);

      // Loader animation and setting up
      var pos = this.$list.position();

      if (actions.loader.progress) {
        this.$loader.find("span").width(actions.loader.progress + "%");
        this.$loader.find("p").text(actions.loader.text)
      }

      actions.loader.animate.properties.top = _.template(String(actions.loader.animate.properties.top), {top: pos.top});

      if (mode == "reset")
        actions.loader.animate.properties.top = actions.loader.animate.properties.top - 20;

      this.$loader
        .removeClass(actions.loader.removeClasses)
        .addClass(actions.loader.addClasses)
        .css(actions.loader.css)
        .stop()
        .animate(
            actions.loader.animate.properties
          , actions.loader.animate.options
        )

      // Show stop
      if (actions.stop) {
        this.$loader.find("a.stop").show();
      } else {
        this.$loader.find("a.stop").hide();
      }

      // Show loader?
      if (actions.showLoader) {
        this._showLoader();
      } else {
        this._hideLoader();
      }
    },

    _ok: function(e) {
      if (e) e.preventDefault();

      if (this.upload_panes.activeTab == 'file') {
        this._uploadData();
      } else if (this._isEnabled()) {
        // If it is enabled to get an asset, go for it!
        this.trigger('fileChosen', this.model.get('value'));
        this.hide();
      }

      return false;
    },


    ////////////////////////
    //  HELPER FUNCTIONS  //
    ////////////////////////

    // Check if it is enable
    _isEnabled: function() {
      if (!this.model.get('value') || this.model.get('state') == "uploading") {
        return false;
      }

      return true;
    },

    // True cleanning
    clean: function() {
      // Destroy fileupload
      this.$upload.fileupload("destroy");
      this.$upload.unbind("mouseleave");

      // Remove keydown binding
      $(document).unbind('keydown', this._keydown);

      // Cancel upload in case there is one active
      if (this.jqXHR)
        this._onUploadAbort();

      cdb.admin.BaseDialog.prototype.clean.call(this);
    }

  });
