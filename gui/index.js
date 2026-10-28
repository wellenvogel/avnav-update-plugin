(function(){
    const BETA_STATE={
        inactive: 'inactive',
        inactiveMod: 'inactive-mod',
        active: 'active',
        activeMod: 'active-mod'
    };
    let webSocketConnection;
    let lastUpdateSequence;
    let flask;
    let apiRequest=function(command){
        let url="/api/"+command;
        return new Promise(function(resolve,reject){
            fetch(url)
            .then(function(r){
                return r.json();
            })
            .then(function(data){
                if (! data.status || data.status !== 'OK'){
                    reject("status: "+data.status);
                    retturn;
                }
                resolve(data);
                return;
            })
            .catch(function(error){
                reject(error);
            });
        });
    }
    let listStateTimer;
    let restingListState='';
    let setListState=function(text,blink,autoClear){
        let el=document.getElementById('listState');
        if (! el) return;
        clearTimeout(listStateTimer);
        el.textContent=text;
        el.classList.toggle('blink',!!blink);
        if (autoClear){
            listStateTimer=setTimeout(function(){el.textContent=restingListState;},2500);
        }
    }
    let packageFilter='updates';
    let packageSearch='';
    let isDisabledPackage=function(le){
        return !!le.disabled && le.disabled !== '0';
    }
    const PACKAGE_KINDS={
        disabled:{label:'Disabled',hint:'This package is disabled'},
        notinstalled:{label:'Not installed',hint:'The package is available but not installed'},
        downgrade:{label:'Downgrade possible',hint:'An older version is available'},
        update:{label:'Update available',hint:'A newer version is available'},
        current:{label:'Up to date',hint:'The installed version is the newest available'}
    };
    let packageKind=function(le,isDowngrade){
        if (isDisabledPackage(le)) return 'disabled';
        if (! le.version) return 'notinstalled';
        if (isDowngrade) return 'downgrade';
        if (le.candidate) return 'update';
        return 'current';
    }
    let applyFilter=function(){
        let items=document.querySelectorAll('#infoFrame .packageItem');
        let visible=0;
        let updatable=0;
        items.forEach(function(li){
            let isDis=li.getAttribute('data-kind') === 'disabled';
            let isNew=li.getAttribute('data-kind') === 'notinstalled';
            let hasCandidate=li.getAttribute('data-candidate') === 'true';
            let isUpdate=!isDis && !isNew && hasCandidate;
            if (isUpdate) updatable++;
            let show;
            if (packageFilter === 'all') show=true;
            else if (packageFilter === 'disabled') show=isDis;
            else show=isUpdate;
            if (show && packageSearch){
                show=li.getAttribute('data-name').toLowerCase().indexOf(packageSearch) >= 0;
            }
            li.hidden=!show;
            if (show) visible++;
        });
        let count=document.getElementById('packageCount');
        if (count) count.textContent=items.length?('('+updatable+' of '+items.length+' updatable)'):'';
        document.querySelectorAll('.chip').forEach(function(chip){
            chip.setAttribute('aria-pressed',chip.getAttribute('data-filter') === packageFilter?'true':'false');
        });
        let empty=document.querySelector('#infoFrame .emptyList');
        if (empty){
            empty.hidden=visible > 0 || ! items.length;
            empty.textContent=(packageFilter === 'updates' && ! packageSearch)
                ? 'All packages are up to date. Choose "All" to see every package.'
                : 'No packages match.';
        }
    }
    let buildVersionLine=function(le,isDowngrade,kind){
        let line=document.createElement('div');
        line.classList.add('versionLine');
        let add=function(text,cls){
            let s=document.createElement('span');
            s.textContent=text;
            if (cls) s.className=cls;
            line.appendChild(s);
        }
        let installed=le.version || 'not installed';
        if (le.candidate){
            add(installed,le.version?'from':'from none');
            add('\u2192','arrow');
            add(le.candidate,isDowngrade?'to downgrade':'to');
            line.setAttribute('aria-label',installed+' to '+le.candidate);
        }
        else{
            add(installed,le.version?'from':'from none');
            add(kind === 'current'?'up to date':'no candidate','none');
        }
        return line;
    }
    let packageData;
    let fetchList=function(){
        let listFrame=document.getElementById('infoFrame');
        if (! listFrame) return;
        listFrame.innerHTML='<li class="updateRunning blink">Reading Packages...</li>';
        setListState('Reading packages...',true);
        apiRequest('fetchList')
            .then(function(data){
                packageData=data.data;
                restingListState='List read '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                setListState('Package list updated',false,true);
                renderList();
            })
            .catch(function(error){
                setListState('Reading packages failed',false,true);
                alert("unable to fetch info: "+error);
            })
    }
    let renderList=function(){
        let listFrame=document.getElementById('infoFrame');
        if (! listFrame || ! packageData) return;
        {
            {
                let allowDowngrade=document.getElementById('allowDowngrade')?.checked;
                let betaStatus=document.getElementById('betaStatus');
                let betaActive=false;
                let betaChange=false;
                let entries=[];
                packageData.forEach(function(orig){
                    let le=Object.assign({},orig);
                    //compute candidate
                    let isDowngrade=false;
                    if (le.candidate == le.version) le.candidate=undefined;
                    if (! le.candidate && allowDowngrade){
                        let cv=le.versions[0]
                        if (cv){
                            if (cv.state < 0) {
                                isDowngrade=true;
                                le.candidate=cv.version;
                            }
                        }
                    }
                    if (le.beta == BETA_STATE.active || le.beta == BETA_STATE.activeMod){
                        betaActive=true;
                    }
                    if (le.beta == BETA_STATE.activeMod || le.beta == BETA_STATE.inactiveMod){
                        betaChange=true;
                    }
                    let hasCandidate=!!le.candidate;
                    let kind=packageKind(le,isDowngrade);
                    let item=document.createElement('li');
                    item.classList.add('packageItem');
                    item.setAttribute('data-name',le.name || '');
                    item.setAttribute('data-kind',kind);
                    item.setAttribute('data-candidate',hasCandidate?'true':'false');
                    if (! hasCandidate) item.classList.add('noCandidate');
                    else item.classList.add(isDowngrade?'downgradeCandidate':'upgradeCandidate');
                    if (kind === 'disabled'){
                        item.classList.add('disabledPackage');
                    }
                    let heading=document.createElement('div');
                    heading.classList.add('packageHeading');
                    let name=document.createElement('strong');
                    name.classList.add('packageName');
                    name.textContent=le.name || 'Unnamed package';
                    heading.appendChild(name);
                    let state=document.createElement('span');
                    state.classList.add('packageState');
                    state.classList.add('state-'+kind);
                    state.textContent=PACKAGE_KINDS[kind].label;
                    state.title=PACKAGE_KINDS[kind].hint;
                    heading.appendChild(state);
                    item.appendChild(heading);
                    item.appendChild(buildVersionLine(le,isDowngrade,kind));

                    let selectLabel=document.createElement('label');
                    selectLabel.classList.add('packageSelect');
                    let checkbox=document.createElement('input');
                    checkbox.setAttribute('type','checkbox');
                    checkbox.setAttribute('data-name',le.name);
                    checkbox.setAttribute('aria-label','Select '+(le.name || 'package'));
                    if (le.candidate != null){
                        checkbox.setAttribute('data-version',le.candidate);
                    }
                    checkbox.setAttribute('data-installed',le.version || '');
                    checkbox.setAttribute('data-downgrade',isDowngrade?'true':'false');
                    checkbox.disabled=!hasCandidate;
                    checkbox.checked=hasCandidate && !!le.version && kind !== 'disabled' && !isDowngrade;
                    let selectText=document.createElement('span');
                    selectText.textContent='Select for update';
                    selectLabel.appendChild(checkbox);
                    selectLabel.appendChild(selectText);
                    item.appendChild(selectLabel);
                    let rank=kind === 'disabled'?3:(hasCandidate?(isDowngrade?1:0):2);
                    entries.push({rank:rank,name:le.name || '',item:item});
                })
                entries.sort(function(a,b){
                    return (a.rank-b.rank) || a.name.localeCompare(b.name);
                });
                listFrame.innerHTML='';
                entries.forEach(function(e){listFrame.appendChild(e.item);});
                let empty=document.createElement('li');
                empty.className='emptyList';
                listFrame.appendChild(empty);
                applyFilter();
                updateSelection();
                betaStatus.className="statusText "+(betaActive?'ok':'unknown');
                betaStatus.setAttribute('aria-label',betaActive?'Beta enabled':'Beta disabled');
                for (let bt of (['enableBeta','disableBeta'])){
                    const bte=document.getElementById(bt);
                    if (bte){
                        bte.style.display = betaChange ? 'inline-block' : 'none';
                        const disabled=(bt === 'enableBeta')?betaActive:!betaActive;
                        bte.setAttribute('data-disabled', disabled);
                    }
                }
            }
        }
    }

    let actionRunning=false;
    let updateSelection=function(){
        let bt=document.getElementById('updatePackages');
        if (! bt) return;
        let count=document.querySelectorAll('#infoFrame input[type=checkbox]:checked').length;
        bt.textContent=count?('Update '+count+(count === 1?' package':' packages')):'Update Packages';
        bt.setAttribute('data-disabled',count?'false':'true');
        buttonEnable(bt,!actionRunning);
    }
    let selectVisible=function(checked){
        document.querySelectorAll('#infoFrame .packageItem:not([hidden])')
            .forEach(function(item){
                let cb=item.querySelector('input[type=checkbox]');
                if (! cb || cb.disabled) return;
                // "select all" never picks packages that are not installed yet
                if (checked && item.getAttribute('data-kind') === 'notinstalled') return;
                cb.checked=checked;
            });
        updateSelection();
    }

    let confirmUpdate=function(){
        return new Promise(function(resolve){
            let overlay=document.getElementById('confirmOverlay');
            if (! overlay){
                resolve(true);
                return;
            }
            let content=overlay.querySelector('.overlayContent');
            content.innerHTML='';
            let boxes=document.querySelectorAll('#infoFrame input[type=checkbox]:checked');
            let title=document.createElement('strong');
            title.textContent='Update '+boxes.length+(boxes.length === 1?' package?':' packages?');
            content.appendChild(title);
            let list=document.createElement('ul');
            list.className='confirmList';
            let downgrade=false;
            boxes.forEach(function(cb){
                let li=document.createElement('li');
                let isDown=cb.getAttribute('data-downgrade') === 'true';
                if (isDown) downgrade=true;
                let installed=cb.getAttribute('data-installed') || 'not installed';
                li.textContent=cb.getAttribute('data-name')+': '+installed+' \u2192 '+
                    (cb.getAttribute('data-version') || 'newest')+(isDown?' (downgrade)':'');
                if (isDown) li.className='downgrade';
                list.appendChild(li);
            });
            content.appendChild(list);
            let note=document.createElement('p');
            note.textContent='AvNav is stopped during the update and started again afterwards.'+
                (downgrade?' The selection contains downgrades.':'');
            content.appendChild(note);
            let done=function(result){
                overlay.style.visibility='hidden';
                document.getElementById('confirmOk').onclick=null;
                document.getElementById('confirmCancel').onclick=null;
                resolve(result);
            };
            document.getElementById('confirmOk').onclick=function(){done(true);};
            document.getElementById('confirmCancel').onclick=function(){done(false);};
            overlay.style.visibility='unset';
        });
    }

    let closeWs=function(){
        if (webSocketConnection){
            try{
                webSocketConnection.close();
                webSocketConnection=undefined;
            }catch(e){console.log("error closing ws: "+e);}
        }
    }
    let showHideOverlay=function(id,show){
        let ovl=id;
        if (typeof(id) === 'string'){
            ovl=document.getElementById(id);
        }
        if (!ovl) return;
        ovl.style.visibility=show?'unset':'hidden';
        return ovl;
    }
    let closeOverlayFromButton=function(btEvent){
        let target=btEvent.target;
        while (target && target.parentElement){
            target=target.parentElement;
            if (target.classList.contains('overlayFrame')){
                showHideOverlay(target,false);
                return;
            }
        }
    }
    let buttonEnable=function(id,enable){
        let bt=id;
        if (typeof(id) === 'string'){
            bt=document.getElementById(id);
        }
        if (! bt) return;
        let overwrite=bt.getAttribute('data-disabled');
        if (enable && ! (overwrite === 'true')){
            bt.removeAttribute('disabled');
        }
        else{
            bt.setAttribute('disabled','');
        }

    }
    let showConsole=function(opt_text){
        let overlay=document.getElementById('responseOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        let content=overlay.querySelector('.overlayContent');
        closeWs();
        if (opt_text){
            content.textContent=opt_text;
            return;
        }
        content.textContent=''
        //open ws here
        try{
            webSocketConnection=new WebSocket('ws://'+window.location.host+"/api/ws");
            webSocketConnection.onmessage=function(message){
                content.textContent+="\n"+message.data;
                content.scrollTop=content.scrollHeight;
            }
            webSocketConnection.onopen=function(){
                
            }
            webSocketConnection.onerror=function(err){
                alert("websocket error: "+err.currentTarget.url);
            }
        }catch (e){
            alert("unable to open websocket: "+e);
        }
    }

    let fillLog=function(){
        let logElement=document.querySelector('#logOverlay .overlayContent');
        if (! logElement) return;
        fetch('/api/getLog?maxSize=100000')
            .then(function(resp){
                return resp.text();
            })
            .then(function(text){
                logElement.textContent=text;
                logElement.scrollTop=logElement.scrollHeight;
            })
            .catch(function(error){
                showConsole(error);
            })
    }

    let showLog=function(){
        let overlay=document.getElementById('logOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        fillLog();
    }
    let ignoreNextChanged=false;
    let codeChanged=function(changed){
        buttonEnable('saveEditOverlay',changed && ! ignoreNextChanged);
        ignoreNextChanged=false;
    }

    let showEdit=function(){
        showHideOverlay('editOverlay',true);
        fetch('/api/getConfig')
        .then(function(resp){
            return resp.text();
        })
        .then(function(text){
            if (flask) flask.updateCode(text);
            codeChanged(false);
            ignoreNextChanged=true;
        })
        .catch(function(error){
            showConsole(error);
        })
    }
    let parseXml=function(text){
        let xmlDoc=undefined;
        if (window.DOMParser) {
            // code for modern browsers
            let parser = new DOMParser();
            xmlDoc = parser.parseFromString(text,"text/xml");
        } else {
            // code for old IE browsers
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = false;
            xmlDoc.loadXML(text);
        }
        return xmlDoc;
    };

    let saveConfig=function(){
        if (! flask) return;
        let data=flask.getCode();
        try{
            let doc=parseXml(data);
            let errors=doc.getElementsByTagName('parsererror');
            if (errors.length > 0){
                showConsole("invalid xml: "+errors[0].textContent.replace(/ *[bB]elow is a .*/,''));
                return;
            }
        }catch(e){
            showConsole("internal error: "+e);
            return;
        }
        if (confirm("Really overwrite AvNav config and restart AvNav?")){
            fetch('/api/uploadConfig',{
                method: 'POST',
                headers:{
                    'Content-Type':'text/plain'
                },
                body: data
            })
            .then(function(resp){
                return resp.json();
            })
            .then(function(result){
                if (! result.status || result.status !== 'OK'){
                    showConsole(result.status);
                    return;
                }
                showHideOverlay('editOverlay',false);
                startAction('restart');
            })
            .catch(function(error){
                showConsole(error);
            })
            return ;
        }
    }

    let statusToText=function(status){
        if (status === 1) return "running";
        if (status === 2) return "stopped";
        if (status === 3) return "not installed";
    }
    let startAction = function (action) {
        if (!action) return;
        if (action == 'showLog') {
            showLog();
            return;
        }
        if (action == 'showEdit') {
            showEdit();
            return;
        }
        if (action === 'updatePackages') {
            let tickedBoxes = document.querySelectorAll('#infoFrame input[type=checkbox]:checked');
            let packageList = [];
            for (let i = 0; i < tickedBoxes.length; i++) {
                let name = tickedBoxes[i].getAttribute('data-name');
                let version=tickedBoxes[i].getAttribute('data-version');
                if (name) {
                    if (version != null){
                        packageList.push(encodeURIComponent(name+ "=" +version));
                    }
                    else{
                        packageList.push(encodeURIComponent(name));
                    }
                }
            }
            if (packageList.length < 1) {
                showConsole("Error: no packages selected for update");
                return;
            }
            action += "?"
            packageList.forEach(function (p) {
                action += "package=" + p + "&";
            });
        }
        apiRequest(action)
            .then(function (response) {
                showConsole();
            })
            .catch(function (error) {
                showConsole("Error: " + error);
            })
    };

    let buttonActions={
        reload: fetchList,
        updateList: function(){startAction('updateList')},
        enableBeta: function(){startAction('enableBeta')},
        disableBeta: function(){startAction('disableBeta')},
        updatePackages: function(){
            confirmUpdate().then(function(ok){
                if (ok) startAction('updatePackages');
            });
        },
        selectAll: function(){selectVisible(true);},
        selectNone: function(){selectVisible(false);},
        restart: function(){startAction('restart')},
        showLog: showLog,
        showEdit: showEdit,
        closeOverlay: closeOverlayFromButton,
        downloadLogOverlay: function(){window.location.href='/api/downloadLog';},
        refreshLogOverlay: fillLog,
        closeLogOverlay: closeOverlayFromButton,
        downloadEditOverlay: function(){window.location.href='/api/downloadConfig';},
        saveEditOverlay: saveConfig,
        closeEditOverlay: closeOverlayFromButton,
        showConsole: function(){showConsole();}
    }
    window.addEventListener('load',function(){
        let title=document.getElementById('title');
        if (window.location.search.match(/title=no/)){
            if (title) title.style.display="none";
        }
        let buttons=document.querySelectorAll('button')
        for (let i=0;i<buttons.length;i++){
            let bt=buttons[i];
            let handler=buttonActions[bt.getAttribute('id')]||
                buttonActions[bt.getAttribute('name')];
            if (handler){
                bt.addEventListener('click',handler);
            }    

        }
        flask=new CodeFlask('#editOverlay .overlayContent',{
            language: 'markup',
            lineNumbers: true,
            defaultTheme: false
        });
        flask.onUpdate(function(){codeChanged(true)});
        let updateNetworkActive=document.getElementById('networkUpdate');
        let networkState=document.getElementById('networkStatus');
        let first=true;
        this.window.setInterval(function(){
            let url='status';
            if (first || updateNetworkActive && updateNetworkActive.checked){
                first=false;
                url+="?includeNet=1";
            }
            apiRequest(url)
            .then(function(data){
                actionRunning=!!data.actionRunning;
                let buttons=document.querySelectorAll('button.action');
                for (let i=0;i<buttons.length;i++){
                    buttonEnable(buttons[i],! data.actionRunning);
                }
                updateSelection();
                buttonEnable('showConsole',data.actionRunning);
                let actionDisplay=document.getElementById('runningAction');
                if (actionDisplay){
                    if (data.actionRunning){
                        actionDisplay.classList.remove('stopped');
                        actionDisplay.classList.add('running');
                        let txt=actionDisplay.querySelector('.actionName');
                        if (txt){
                            txt.textContent=data.currentAction;
                        }
                    }
                    else{
                        actionDisplay.classList.remove('running');
                        actionDisplay.classList.add('stopped');
                    }
                }
                let statusText=document.getElementById('avnavStatusText');
                if (statusText){
                    statusText.textContent=statusToText(data.avnavRunning);
                    statusText.setAttribute('data-status',data.avnavRunning);
                }
                if (networkState){
                    let newState='unknown';
                    if (data.network !== undefined){
                        if (data.network) newState='ok';
                        else newState='error';
                    }
                    if (! networkState.classList.contains(newState)){
                        let states=['unknown','error','ok'];
                        states.forEach(function(state){
                            if (state !== newState){
                                networkState.classList.remove(state);
                            }
                            else{
                                networkState.classList.add(state);
                            }
                        });
                    }
                }
                buttonEnable('showLog',data.logFile === 'read');
                buttonEnable('showEdit',data.configFile === 'read' 
                    || data.configFile === 'write');
                if (flask){
                    if (data.configFile !== 'write') {
                        flask.enableReadonlyMode();
                    }
                    else{
                        flask.disableReadonlyMode();
                    }

                }     
                if (lastUpdateSequence !== data.updateSequence){
                    lastUpdateSequence=data.updateSequence;
                    fetchList();
                }
            })
            .catch(function(error){
                console.log(error);
            })
        },1000);
        let infoFrame=document.getElementById('infoFrame');
        if (infoFrame) infoFrame.addEventListener('change',updateSelection);
        let search=document.getElementById('packageSearch');
        if (search) search.addEventListener('input',function(){
            packageSearch=search.value.trim().toLowerCase();
            applyFilter();
        });
        document.querySelectorAll('.chip').forEach(function(chip){
            chip.addEventListener('click',function(){
                packageFilter=chip.getAttribute('data-filter');
                applyFilter();
            });
        });
        let allowDowngrade=document.getElementById('allowDowngrade')
        if (allowDowngrade) allowDowngrade.addEventListener("change",renderList)
        fetchList();
    })
})();